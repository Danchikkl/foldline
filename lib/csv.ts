import type { InvoiceData } from "@/lib/invoice";

function safeCell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula-injection defense
  return `"${s.replace(/"/g, '""')}"`;
}

export function invoiceCsv(data: InvoiceData) {
  const rows: string[][] = [
    ["supplier_name", "supplier_bin", "invoice_number", "invoice_date", "currency", "description", "quantity", "unit_price", "amount", "subtotal", "vat", "total"],
  ];
  const items = data.line_items.length
    ? data.line_items
    : [{ description: "", quantity: null, unit_price: null, amount: null, confidence: 0, evidence: "" }];

  for (const item of items) {
    rows.push([
      data.supplier_name.value,
      data.supplier_bin.value,
      data.invoice_number.value,
      data.invoice_date.value,
      data.currency.value,
      item.description,
      item.quantity,
      item.unit_price,
      item.amount,
      data.subtotal.value,
      data.vat.value,
      data.total.value,
    ].map((v) => (v == null ? "" : String(v))));
  }
  return rows.map((row) => row.map(safeCell).join(",")).join("\r\n");
}
