"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FlaskConical, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import {
  auditLedger, detectColumns, findingsCsv, readLedgerFile, FINDING_LABELS, LedgerError,
  type ColumnMap, type Finding, type FindingType, type Grid, type LedgerField, type LedgerSummary,
} from "@/lib/vault/ledger";
import type { DateOrder } from "@/lib/dates";

type Result = { findings: Finding[]; summary: LedgerSummary; headers: string[]; headerRow: number; map: ColumnMap };

const FIELD_LABELS: Record<LedgerField, string> = { vendor: "Supplier", number: "Invoice number", date: "Invoice date", amount: "Amount", currency: "Currency (optional)" };
const TYPE_CLASS: Record<FindingType, string> = { exact: "status-failed", similar_reference: "status-failed", number_reused: "status-processing", same_amount_date: "status-processing", unusual_frequency: "status-processing" };
const TYPE_HELP: Record<FindingType, string> = {
  exact: "The same supplier and invoice number appear more than once. Check whether both were paid.",
  similar_reference: "Same supplier and amount, and the invoice number differs by a suffix, a prefix or one character. This is how a resent or re-keyed invoice slips past an exact-match check.",
  number_reused: "The same invoice number appears with different amounts. It may be a corrected invoice, or a number used twice.",
  same_amount_date: "Same supplier, amount and date under different numbers. Often legitimate (two identical jobs), sometimes the same bill entered twice.",
  unusual_frequency: "This supplier normally bills this amount at a steady interval, and here it appears twice close together.",
};
const MAX_SHOWN = 150;

const SAMPLE = [
  "Vendor,Invoice Number,Invoice Date,Amount",
  "Greenfield Plumbing LLC,GP-20418,11/25/2026,703.08",
  "Harbor Realty Trust,R-2026-07,07/01/2026,2400.00",
  "City Water & Sewer,W-88121,07/05/2026,214.60",
  "Harbor Realty Trust,R-2026-08,08/01/2026,2400.00",
  "Northside Office Supply,NS-5512,08/14/2026,322.40",
  "Harbor Realty Trust,R-2026-09,09/01/2026,2400.00",
  "Brightline Landscaping LLC,BL-0456,09/07/2026,561.60",
  "Brightline Landscaping LLC,BL-0456A,09/12/2026,561.60",
  "Harbor Realty Trust,R-2026-10,10/01/2026,2400.00",
  "Harbor Realty Trust,HRT-10-B,10/04/2026,2400.00",
  "Summit HVAC Services Inc.,7731,10/02/2026,500.00",
  "Summit HVAC Services Inc.,7731,10/20/2026,650.00",
  "Coastal Electrical Pty Ltd,INV-00932,10/14/2026,2640.00",
  "\"Greenfield Plumbing, L.L.C.\",GP-2O418,11/25/2026,703.08",
  "Harbor Realty Trust,R-2026-11,11/01/2026,2400.00",
  "Delta Courier,DC-1001,11/03/2026,45.00",
  "Delta Courier,DC-1002,11/03/2026,45.00",
  "Northside Office Supply,NS-5601,11/18/2026,96.25",
].join("\n");

const money = (value: number, currency?: string) => `${currency ? `${currency} ` : ""}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

export function LedgerAudit() {
  const gridRef = useRef<Grid | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [order, setOrder] = useState<DateOrder | "auto">("auto");
  const [combine, setCombine] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = useCallback((grid: Grid, options: { map?: ColumnMap; headerRow?: number; order?: DateOrder | "auto"; combine?: boolean | null }) => {
    try {
      const out = auditLedger(grid, {
        map: options.map,
        headerRow: options.headerRow,
        order: !options.order || options.order === "auto" ? null : options.order,
        combineSplit: options.combine ?? null,
      });
      setResult({ findings: out.findings, summary: out.summary, headers: out.headers, headerRow: out.headerRow, map: out.map });
      setError("");
    } catch (e) {
      // Columns could not be worked out: show the mapping controls so the user can set them.
      const detected = detectColumns(grid);
      setResult((prev) => prev && options.map ? { ...prev, map: options.map, findings: [], summary: { ...prev.summary, invoices: 0 } } : { findings: [], summary: emptySummary(), headers: detected.headers, headerRow: detected.headerRow, map: options.map ?? detected.map });
      setError(e instanceof LedgerError ? e.message : "This file could not be checked.");
    }
  }, []);

  async function open(bytes: Uint8Array, name: string) {
    setBusy("Reading and checking on this device…");
    setError(""); setResult(null); setOrder("auto"); setCombine(null);
    await new Promise((r) => setTimeout(r, 30)); // let the status paint before the heavy work
    try {
      const grid = readLedgerFile(bytes, name);
      if (grid.filter((r) => r.some(Boolean)).length < 2) throw new LedgerError("This file has no rows to check.");
      gridRef.current = grid;
      setFilename(name);
      run(grid, {});
    } catch (e) {
      gridRef.current = null;
      setError(e instanceof LedgerError ? e.message : "This file could not be read. Upload a CSV or .xlsx export.");
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  function clear() {
    gridRef.current = null;
    setResult(null); setFilename(""); setError(""); setOrder("auto"); setCombine(null);
  }

  function remap(field: LedgerField, value: string) {
    if (!gridRef.current || !result) return;
    const map = { ...result.map, [field]: value === "" ? null : Number(value) };
    run(gridRef.current, { map, headerRow: result.headerRow, order, combine });
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([findingsCsv(result.findings)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "foldline-possible-duplicates.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const totalFindings = result ? result.findings.length : 0;
  const skippedText = useMemo(() => {
    if (!result) return "";
    const s = result.summary.skipped;
    const parts = [
      s.credits ? plural(s.credits, "credit or zero row") : "",
      s.noAmount ? plural(s.noAmount, "row") + " without an amount" : "",
      s.totals ? plural(s.totals, "totals row") : "",
      s.noIdentity ? plural(s.noIdentity, "row") + " with no supplier or number" : "",
    ].filter(Boolean);
    return parts.length ? `Not checked: ${parts.join(", ")}.` : "";
  }, [result]);

  return <div className="dashboard">
    <header className="dashHeader"><div><span className="eyebrow"><FileSpreadsheet size={13}/> Paid-twice audit</span><h1>{result && result.summary.invoices ? (totalFindings ? `${plural(totalFindings, "possible duplicate")} in ${plural(result.summary.invoices, "invoice")}.` : `No duplicates found in ${plural(result.summary.invoices, "invoice")}.`) : "Find invoices that were entered or paid twice."}</h1></div>{result && <button className="button buttonGhost" onClick={clear}><Trash2 size={15}/>Clear</button>}</header>
    <div className="vaultPromise"><ShieldCheck size={16}/><span><b>This file never leaves this device.</b> It is read and checked in your browser. Nothing from it is uploaded or saved, not even in encrypted form. Close or clear the page and it is gone.</span></div>

    {!result && <section className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void f.arrayBuffer().then((b) => open(new Uint8Array(b), f.name)); }}>
      <input ref={input} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.arrayBuffer().then((b) => open(new Uint8Array(b), f.name)); }} />
      <div className="dropIcon"><FileSpreadsheet size={25}/></div>
      <h3>{busy || "Drop an export of paid bills (CSV or Excel)"}</h3>
      <p>From QuickBooks, Xero, NetSuite, 1C or a spreadsheet. It needs four columns: supplier, invoice number, invoice date and amount. A year of data works best.</p>
      {!busy && <div className="dropActions"><button className="button buttonDark" onClick={() => input.current?.click()}>Choose file</button><button className="button buttonGhost" onClick={() => void open(new TextEncoder().encode(SAMPLE), "sample-paid-bills.csv")}><FlaskConical size={15}/> Try a sample file</button></div>}
    </section>}
    {error && <div className="formError vaultErrors" role="alert">{error}</div>}

    {result && <>
      <section className="ledgerPanel">
        <div className="sectionHeader"><h2>{filename}</h2><span>header on row {result.headerRow + 1}</span></div>
        <div className="ledgerMap">
          {(Object.keys(FIELD_LABELS) as LedgerField[]).map((field) => <label key={field}>{FIELD_LABELS[field]}
            <select value={result.map[field] ?? ""} onChange={(e) => remap(field, e.target.value)}>
              <option value="">{field === "currency" || field === "date" ? "None" : "Choose a column"}</option>
              {result.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </label>)}
          <label>Date format
            <select value={order} onChange={(e) => { const v = e.target.value as DateOrder | "auto"; setOrder(v); if (gridRef.current) run(gridRef.current, { map: result.map, headerRow: result.headerRow, order: v, combine }); }}>
              <option value="auto">Auto ({result.summary.dateOrder === "dmy" ? "day/month" : "month/day"})</option>
              <option value="mdy">Month/Day/Year (US)</option>
              <option value="dmy">Day/Month/Year</option>
            </select>
          </label>
        </div>
        {order === "auto" && !result.summary.dateOrderCertain && result.map.date !== null && <div className="vaultWarn"><TriangleAlert size={14}/> <b>Check the date format.</b> Every date in this file can be read as day/month or month/day. Foldline assumed month/day. If that is wrong, choose the format above, because the checks depend on how far apart invoices are.</div>}
        <label className="trialAccept ledgerToggle"><input type="checkbox" checked={combine ?? result.summary.combinedSplitLines} onChange={(e) => { setCombine(e.target.checked); if (gridRef.current) run(gridRef.current, { map: result.map, headerRow: result.headerRow, order, combine: e.target.checked }); }} /><span>This export lists one bill on several lines (combine them into one invoice)</span></label>
      </section>

      {result.summary.invoices > 0 && <div className="ledgerStats">
        <div><b>{result.summary.invoices.toLocaleString("en-US")}</b><span>invoices checked</span></div>
        <div><b>{result.summary.vendors.toLocaleString("en-US")}</b><span>suppliers</span></div>
        <div><b>{totalFindings.toLocaleString("en-US")}</b><span>possible duplicates</span></div>
        <div className={result.summary.likelyOverpaid ? "ledgerStatAlert" : ""}><b>{money(result.summary.likelyOverpaid)}</b><span>possibly paid twice (strongest matches only)</span></div>
      </div>}
      {(skippedText || result.summary.undatedRows > 0) && <p className="vaultMuted">{skippedText}{result.summary.undatedRows > 0 ? ` ${plural(result.summary.undatedRows, "invoice")} had no readable date; date-based checks were skipped for them.` : ""}</p>}

      {result.summary.invoices > 0 && <section className="documentsSection">
        <div className="sectionHeader"><h2>Findings</h2>{totalFindings > 0 && <button className="button buttonGhost" onClick={download}><Download size={15}/>Download all (CSV)</button>}</div>
        {totalFindings === 0 && <div className="emptyList">Nothing in this file looks like a duplicate. That covers exact repeats, changed invoice numbers, reused numbers and repeated amounts.</div>}
        {result.findings.slice(0, MAX_SHOWN).map((f, index) => <article className="ledgerFinding" key={index}>
          <div className="ledgerFindingHead"><span className={`status ${TYPE_CLASS[f.type]}`}>{FINDING_LABELS[f.type]}</span><b>{f.vendor}</b>{f.exposure !== null && <span className="ledgerExposure">{money(f.exposure, f.rows[0].currency)} at risk</span>}</div>
          <p className="vaultMuted">{TYPE_HELP[f.type]}</p>
          <table className="vaultTable ledgerRows"><thead><tr><th>File row</th><th>Supplier</th><th>Invoice #</th><th>Date</th><th>Amount</th></tr></thead><tbody>
            {f.rows.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.vendor}</td><td>{r.number || "—"}</td><td>{r.date || r.dateRaw || "—"}</td><td>{money(r.amount, r.currency)}{r.merged > 1 ? ` (${r.merged} lines)` : ""}</td></tr>)}
          </tbody></table>
          <p className="ledgerWhy">Matched on: {f.signals.join(", ")}.</p>
        </article>)}
        {totalFindings > MAX_SHOWN && <p className="vaultMuted">Showing the first {MAX_SHOWN} of {totalFindings.toLocaleString("en-US")}. Download the CSV for the full list.</p>}
        <p className="vaultMuted">A finding is a reason to look, not proof of a double payment. Check each one against the supplier statement before asking for money back.</p>
      </section>}
    </>}
  </div>;
}

function emptySummary(): LedgerSummary {
  return { dataRows: 0, invoices: 0, vendors: 0, skipped: { noAmount: 0, credits: 0, noIdentity: 0, totals: 0 }, findings: { exact: 0, number_reused: 0, similar_reference: 0, same_amount_date: 0, unusual_frequency: 0 }, likelyOverpaid: 0, dateOrder: "mdy", dateOrderCertain: true, undatedRows: 0, combinedSplitLines: false };
}
