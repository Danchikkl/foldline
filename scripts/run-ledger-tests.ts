import { readFileSync } from "node:fs";
import { auditLedger, decodeText, detectColumns, findingsCsv, parseAmount, parseCsv, readLedgerFile, LedgerError, type FindingType } from "@/lib/vault/ledger";
import { dateCandidates, inferDateOrder } from "@/lib/dates";

let failed = false;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) { failed = true; console.error(`  ${detail}`); }
};
const types = (csv: string) => auditLedger(parseCsv(csv)).findings.map((f) => f.type);
const has = (csv: string, type: FindingType) => types(csv).includes(type);
const head = "Vendor,Invoice Number,Invoice Date,Amount\n";

// ---- parsing ----
const quoted = parseCsv('Vendor,Invoice Number,Amount\n"Smith, Jones & Co","INV ""A"" 1","1,250.00"\n');
expect("CSV: quoted commas and escaped quotes", quoted[1][0] === "Smith, Jones & Co" && quoted[1][1] === 'INV "A" 1' && quoted[1][2] === "1,250.00", JSON.stringify(quoted));
const semi = parseCsv("Поставщик;Номер;Дата;Сумма\nТОО Ромашка;45;12.03.2026;485 900,00\n");
expect("CSV: semicolon delimiter and Cyrillic headers are detected", semi[1].length === 4 && detectColumns(semi).map.amount === 3 && detectColumns(semi).map.vendor === 0, JSON.stringify(detectColumns(semi)));
expect("CSV: UTF-8 BOM is removed", decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])) === "A");
expect("Amounts: 1,250.00 / 1.250,00 / (300.00) / $45 / 485 900,00",
  parseAmount("1,250.00") === 1250 && parseAmount("1.250,00") === 1250 && parseAmount("(300.00)") === -300 && parseAmount("$45") === 45 && parseAmount("485 900,00") === 485900 && parseAmount("n/a") === null,
  [parseAmount("1,250.00"), parseAmount("1.250,00"), parseAmount("(300.00)"), parseAmount("$45"), parseAmount("485 900,00")].join(" "));
expect("Dates: written, ISO and ambiguous numeric", dateCandidates("3 November 2026")[0] === "2026-11-03" && dateCandidates("Mar 5, 2026")[0] === "2026-03-05" && dateCandidates("03/04/2026").length === 2 && dateCandidates("25/11/2026").length === 1 && dateCandidates("31.02.2026").length === 0, JSON.stringify(dateCandidates("03/04/2026")));
expect("Date order is inferred from the column", inferDateOrder(["01/02/2026", "11/25/2026"]) === "mdy" && inferDateOrder(["01/02/2026", "25/11/2026"]) === "dmy" && inferDateOrder(["01/02/2026"]) === null);

const titled = parseCsv("Acme Holdings\nPaid bills 2026\n\nDate,Num,Name,Memo,Amount,Open Balance\n01/15/2026,B-1,Northwind,rent,1200.00,0\n");
const titledColumns = detectColumns(titled);
expect("Header row is found below a title block (QuickBooks style)", titledColumns.headerRow === 3 && titledColumns.map.vendor === 2 && titledColumns.map.number === 1 && titledColumns.map.amount === 4, JSON.stringify(titledColumns));

// ---- duplicate findings ----
expect("Same invoice entered twice", has(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,INV-100,01/15/2026,500.00\n", "exact"));
expect("INV-100 vs INV100 vs inv 0100 is the same invoice", has(head + "Acme Ltd,INV-100,01/15/2026,500.00\nACME LIMITED,inv 0100,01/15/2026,500.00\n", "exact"));
expect("Letter O for zero (INV-1O0)", has(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,INV-1O0,01/20/2026,500.00\n", "exact"));
expect("Suffix added on resend (INV-100A)", has(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,INV-100A,01/22/2026,500.00\n", "similar_reference"));
expect("Same number, different amount", has(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,INV-100,02/15/2026,650.00\n", "number_reused"));
expect("Different number, same supplier + amount + date", has(head + "Acme Ltd,A-1,01/15/2026,500.00\nAcme Ltd,B-7,01/15/2026,500.00\n", "same_amount_date"));
expect("Consecutive numbers a week apart (weekly billing) are NOT flagged", types(head + "Acme Ltd,1001,01/05/2026,300.00\nAcme Ltd,1002,01/12/2026,300.00\n").length === 0, types(head + "Acme Ltd,1001,01/05/2026,300.00\nAcme Ltd,1002,01/12/2026,300.00\n").join(","));
expect("Consecutive numbers on the same day are only a weak same-day match", types(head + "Acme Ltd,1001,01/05/2026,300.00\nAcme Ltd,1002,01/05/2026,300.00\n").join(",") === "same_amount_date");
expect("A mistyped digit two days later (10234 → 10284) is a changed reference", has(head + "Acme Ltd,INV-10234,01/05/2026,300.00\nAcme Ltd,INV-10284,01/07/2026,300.00\n", "similar_reference"));
expect("Different suppliers never match", types(head + "Acme Ltd,INV-100,01/15/2026,500.00\nBeta Inc,INV-100,01/15/2026,500.00\n").length === 0);

const doubledEarly = () => monthly + "Harbor Realty,HR-9917,04/04/2026,2400.00\n";
const monthly = head + ["01", "02", "03", "04", "05", "06"].map((m, i) => `Harbor Realty,R-${200 + i},${m}/01/2026,2400.00`).join("\n") + "\n";
expect("Monthly rent with consecutive numbers is NOT flagged", types(monthly).length === 0, types(monthly).join(","));
expect("All-ambiguous dates are reported as an uncertain order", auditLedger(parseCsv(monthly)).summary.dateOrderCertain === false && auditLedger(parseCsv(doubledEarly())).summary.dateOrderCertain === false);
const doubled = monthly + "Harbor Realty,HR-9917,04/04/2026,2400.00\n";
const doubledFindings = auditLedger(parseCsv(doubled)).findings;
expect("Monthly bill charged again three days later is flagged as unusual frequency", doubledFindings.some((f) => f.type === "unusual_frequency" && f.exposure === 2400), JSON.stringify(doubledFindings.map((f) => [f.type, f.rows.map((r) => r.number)])));

const triple = auditLedger(parseCsv(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,INV100,01/15/2026,500.00\nAcme Ltd,INV-0100,01/16/2026,500.00\nAcme Ltd,Z-9,03/01/2026,75.00\n"));
expect("Three copies are one finding with two overpayments", triple.findings.length === 1 && triple.findings[0].rows.length === 3 && triple.findings[0].exposure === 1000 && triple.summary.likelyOverpaid === 1000, JSON.stringify(triple.findings));

const messy = auditLedger(parseCsv(head + "Acme Ltd,INV-100,01/15/2026,500.00\nAcme Ltd,CN-5,01/20/2026,(500.00)\nAcme Ltd,INV-101,01/21/2026,\nTotal,,,500.00\n,,01/22/2026,10.00\n"));
expect("Credits, blank amounts, totals rows and unidentified rows are skipped and counted",
  messy.rows.length === 1 && messy.summary.skipped.credits === 1 && messy.summary.skipped.noAmount === 1 && messy.summary.skipped.totals === 1 && messy.summary.skipped.noIdentity === 1, JSON.stringify(messy.summary.skipped));

const uk = auditLedger(parseCsv(head + "Northgate Ltd,N-100,25/11/2026,100.00\nNorthgate Ltd,N-100A,03/12/2026,100.00\nNorthgate Ltd,N-200,04/03/2026,80.00\n"));
expect("Day-first dates: 25/11 and 03/12 are 8 days apart, so the suffixed copy is flagged", uk.summary.dateOrder === "dmy" && uk.findings.some((f) => f.type === "similar_reference"), JSON.stringify([uk.summary.dateOrder, uk.findings.map((f) => f.type)]));

const splitRows = Array.from({ length: 12 }, (_, i) => `Vendor ${i},B-${i},01/${String(i + 1).padStart(2, "0")}/2026,${100 + i}.00\nVendor ${i},B-${i},01/${String(i + 1).padStart(2, "0")}/2026,${20 + i}.00`).join("\n");
const split = auditLedger(parseCsv(head + splitRows + "\n"));
expect("An export with one bill on several lines is combined, not reported as reused numbers", split.summary.combinedSplitLines && split.rows.length === 12 && split.findings.length === 0 && split.rows[0].amount === 120, JSON.stringify([split.summary.combinedSplitLines, split.rows.length, split.findings.length]));

const evil = findingsCsv(auditLedger(parseCsv(head + '=HYPERLINK("http://x"),INV-1,01/15/2026,5.00\n=HYPERLINK("http://x"),INV-1,01/15/2026,5.00\n')).findings);
expect("Exported findings neutralize spreadsheet formulas", evil.includes(`"'=HYPERLINK`) && !/(^|,)"=/m.test(evil), evil);

// ---- Excel ----
const xlsx = new Uint8Array(readFileSync(new URL("../fixtures/ledger/paid-bills.xlsx", import.meta.url)));
const book = auditLedger(readLedgerFile(xlsx, "paid-bills.xlsx"));
expect("Excel: header below a title block, date cells and totals row are handled",
  book.rows.length === 4 && book.rows[0].date === "2026-11-25" && book.summary.skipped.totals === 1 && book.headerRow === 3, JSON.stringify([book.rows.map((r) => [r.vendor, r.number, r.date, r.amount]), book.summary.skipped, book.headerRow]));
expect("Excel: GP-20418 vs GP-2O418 from 'LLC' / 'L.L.C.' is one invoice paid twice; monthly water is not flagged",
  book.findings.length === 1 && book.findings[0].type === "exact" && book.findings[0].exposure === 703.08, JSON.stringify(book.findings.map((f) => [f.type, f.exposure])));

let refused = "";
try { readLedgerFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), "old.xls"); } catch (e) { refused = e instanceof LedgerError ? e.message : "wrong error"; }
expect("Old .xls is refused with a clear message", /\.xlsx or CSV/.test(refused), refused);
let broken = "";
try { readLedgerFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), "broken.xlsx"); } catch (e) { broken = e instanceof LedgerError ? e.message : "wrong error"; }
expect("A corrupt workbook is refused, not crashed on", broken.length > 0 && broken !== "wrong error", broken);

// ---- scale ----
const big = [head.trim()];
for (let i = 0; i < 60_000; i += 1) big.push(`Vendor ${i % 900},V${i % 900}-${i},${String((i % 12) + 1).padStart(2, "0")}/${String((i % 27) + 1).padStart(2, "0")}/2026,${(100 + (i * 37) % 9000).toFixed(2)}`);
big.push("Vendor 5,V5-5,06/06/2026,285.00", "Vendor 5,V5-5,06/06/2026,285.00");
const started = Date.now();
const bigResult = auditLedger(parseCsv(big.join("\n")));
expect(`60,000 rows are checked in under 15 s (took ${Date.now() - started} ms)`, Date.now() - started < 15_000 && bigResult.findings.some((f) => f.type === "exact"), String(bigResult.findings.length));

if (failed) process.exit(1);
