/**
 * Zero-knowledge vault crypto. Runs in the browser (and in Node for tests)
 * using WebCrypto only.
 *
 * - The organization passphrase never leaves the browser.
 * - PBKDF2-SHA256 (600,000 iterations) turns it into a key-encryption key.
 * - A random AES-256-GCM data key encrypts every invoice record. The server
 *   stores that data key only in wrapped (encrypted) form.
 * - Every record is bound to its id and organization (AES-GCM additional
 *   data), so ciphertexts cannot be swapped between records or workspaces.
 *
 * The server can therefore store and return ciphertext, but never read it.
 */

export const VAULT_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;
const CHECK_PLAINTEXT = "foldline-vault-check-v1";

export type VaultHeader = {
  version: number;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  wrapped_key: string;
  wrap_iv: string;
  check_ct: string;
  check_iv: string;
};

export type Sealed = { iv: string; ct: string };

export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase.");
    this.name = "WrongPassphraseError";
  }
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This browser does not support secure encryption (WebCrypto).");
  return s;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const random = (n: number): Uint8Array<ArrayBuffer> => globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

async function deriveKek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await subtle().importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Basic strength rules. A weak passphrase is the only realistic way to break the vault. */
export function passphraseProblems(passphrase: string): string[] {
  const problems: string[] = [];
  const p = passphrase.normalize("NFKC");
  if (p.length < 14) problems.push("Use at least 14 characters (a few unrelated words work well).");
  if (/^(.)\1+$/.test(p)) problems.push("Don't repeat one character.");
  if (/^(?:password|passphrase|foldline|qwerty|123456)/i.test(p)) problems.push("Avoid common words like 'password' or 'foldline'.");
  if (new Set(p).size < 6) problems.push("Use more different characters.");
  return problems;
}

/** Creates a new vault. Returns the header to store on the server and the unlocked data key. */
export async function createVault(passphrase: string, iterations = DEFAULT_ITERATIONS) {
  const salt = random(16);
  const kek = await deriveKek(passphrase, salt, iterations);
  const dataKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapIv = random(12);
  const wrapped = await subtle().wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv: wrapIv });
  const checkIv = random(12);
  const check = await subtle().encrypt({ name: "AES-GCM", iv: checkIv }, dataKey, enc.encode(CHECK_PLAINTEXT));
  const header: VaultHeader = {
    version: VAULT_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toB64(salt),
    wrapped_key: toB64(wrapped),
    wrap_iv: toB64(wrapIv),
    check_ct: toB64(check),
    check_iv: toB64(checkIv),
  };
  // Hand back a non-extractable copy so the raw key cannot be read out of the page.
  const key = await unlockVault(passphrase, header);
  return { header, key };
}

/** Unlocks a vault. Throws WrongPassphraseError if the passphrase is wrong. */
export async function unlockVault(passphrase: string, header: VaultHeader): Promise<CryptoKey> {
  if (header.version !== VAULT_VERSION || header.kdf !== "PBKDF2-SHA256") throw new Error("Unsupported vault format.");
  const kek = await deriveKek(passphrase, fromB64(header.salt), header.iterations);
  let key: CryptoKey;
  try {
    key = await subtle().unwrapKey(
      "raw",
      fromB64(header.wrapped_key),
      kek,
      { name: "AES-GCM", iv: fromB64(header.wrap_iv) },
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new WrongPassphraseError();
  }
  const check = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(header.check_iv) }, key, fromB64(header.check_ct));
  if (dec.decode(check) !== CHECK_PLAINTEXT) throw new WrongPassphraseError();
  return key;
}

/** Encrypts a JSON value, bound to `context` (e.g. organization id + record id). */
export async function sealJson(key: CryptoKey, value: unknown, context: string): Promise<Sealed> {
  const iv = random(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(context) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Decrypts a value sealed with sealJson. Fails if the ciphertext, iv or context was changed. */
export async function openJson<T>(key: CryptoKey, sealed: Sealed, context: string): Promise<T> {
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(sealed.iv), additionalData: enc.encode(context) },
    key,
    fromB64(sealed.ct),
  );
  return JSON.parse(dec.decode(plain)) as T;
}

export const recordContext = (organizationId: string, recordId: string) => `foldline:vault:v1:${organizationId}:${recordId}`;
