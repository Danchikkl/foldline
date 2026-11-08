import { readFileSync, readdirSync } from "node:fs";
import { createVault, unlockVault, sealJson, openJson, recordContext, passphraseProblems, WrongPassphraseError, type VaultHeader } from "@/lib/vault/crypto";
import { checkInvoiceLocally, outcomeOf, type HistoryItem } from "@/lib/vault/local-check";

type Result = { name: string; passed: boolean; detail?: string };
const results: Result[] = [];
const expect = (name: string, passed: boolean, detail = "") => results.push({ name, passed, detail });
async function rejects(fn: () => Promise<unknown>) { try { await fn(); return false; } catch { return true; } }

const ITER = 2_000; // fast for tests; production uses 600,000
const pass = "correct horse battery staple 42";

const { header, key } = await createVault(pass, ITER);
expect("Header holds no passphrase or raw key", !JSON.stringify(header).includes("horse") && header.wrapped_key.length > 40);
expect("Unlocked key is not extractable", key.extractable === false);

const reopened = await unlockVault(pass, header);
const sealed = await sealJson(key, { supplier: "Steppe Build Supply LLP", number: "INV-10234" }, recordContext("org-1", "rec-1"));
expect("Ciphertext does not contain the plaintext", !atob(sealed.ct).includes("Steppe") && !sealed.ct.includes("INV"));
const opened = await openJson<{ supplier: string }>(reopened, sealed, recordContext("org-1", "rec-1"));
expect("Round trip with a re-derived key", opened.supplier === "Steppe Build Supply LLP");

let wrong = false;
try { await unlockVault("wrong passphrase entirely", header); } catch (e) { wrong = e instanceof WrongPassphraseError; }
expect("Wrong passphrase is rejected", wrong);

const tampered = { ...sealed, ct: sealed.ct.slice(0, -4) + (sealed.ct.endsWith("AAAA") ? "BBBB" : "AAAA") };
expect("Tampered ciphertext is rejected", await rejects(() => openJson(key, tampered, recordContext("org-1", "rec-1"))));
expect("Record moved to another id is rejected", await rejects(() => openJson(key, sealed, recordContext("org-1", "rec-2"))));
expect("Record moved to another workspace is rejected", await rejects(() => openJson(key, sealed, recordContext("org-2", "rec-1"))));

const badHeader: VaultHeader = { ...header, salt: header.salt.replace(/^./, header.salt[0] === "A" ? "B" : "A") };
expect("Changed salt cannot unlock", await rejects(() => unlockVault(pass, badHeader)));

expect("Weak passphrase is flagged", passphraseProblems("password123").length > 0);
expect("Long passphrase passes", passphraseProblems(pass).length === 0);

// Full test batch, checked locally in upload order against encrypted-then-decrypted history.
const expected: Record<string, string> = {
  "01": "checked", "02": "issue", "03": "issue", "04": "issue", "05": "issue",
  "06": "checked", "07": "review", "08": "issue", "09": "checked", "10": "not_invoice",
};
const history: HistoryItem[] = [];
const dir = "fixtures/vault";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
  const record = checkInvoiceLocally(readFileSync(`${dir}/${file}`, "utf8"), file.replace(".txt", ".pdf"), history);
  const outcome = outcomeOf(record.validation);
  const want = expected[file.slice(0, 2)];
  expect(`Local check ${file.slice(0, 2)} → ${want}`, outcome === want, `got ${outcome}`);
  const id = `rec-${file.slice(0, 2)}`;
  const box = await sealJson(key, record, recordContext("org-1", id));
  history.push({ id, record: await openJson(key, box, recordContext("org-1", id)) });
}

for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"} ${r.name}${r.passed ? "" : ` — ${r.detail}`}`);
if (results.some((r) => !r.passed)) process.exit(1);
