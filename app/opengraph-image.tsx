import { ImageResponse } from "next/og";

export const alt = "Foldline — catch the duplicate invoice your ERP lets through.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Note for edits: in next/og every <div> with more than one child needs an
// explicit display (flex), and avoid non-Latin glyphs like ✓ — they trigger a
// build-time font download that can fail the build.
export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f4ee", color: "#101217", padding: 72, fontFamily: "sans-serif", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 27, fontWeight: 800 }}><div style={{ width: 46, height: 46, borderRadius: 11, background: "#101217", color: "#c7ff4a", display: "flex", alignItems: "center", justifyContent: "center" }}>F</div>Foldline</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 70, lineHeight: 1, letterSpacing: -3, fontWeight: 800, marginTop: 64 }}>
          <div style={{ display: "flex" }}>Catch the duplicate</div>
          <div style={{ display: "flex" }}>invoice your ERP</div>
          <div style={{ display: "flex" }}>lets through.</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#626873", marginTop: 30 }}>Invoice exception control for Accounts Payable.</div>
      </div>
      <div style={{ width: 340, height: 430, borderRadius: 28, background: "#101217", color: "white", padding: 28, transform: "rotate(3deg)", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 15, color: "#aeb3bb", display: "flex", justifyContent: "space-between" }}><span>INV-10234A.pdf</span><span style={{ color: "#ff7b72" }}>Possible duplicate</span></div>
        <div style={{ marginTop: 34, background: "#23272f", borderRadius: 17, padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", fontSize: 12, color: "#aeb3bb" }}>COMPARED WITH 214 INVOICES</div>
          <div style={{ border: "1px solid #6b2a26", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column", background: "#2e1615" }}><b>Matches INV-10234</b><span style={{ color: "#ff7b72", fontSize: 13, marginTop: 4 }}>Same supplier · same total</span></div>
          <div style={{ border: "1px solid #3a4049", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column" }}><b>Required fields</b><span style={{ color: "#c7ff4a", fontSize: 13, marginTop: 4 }}>All present</span></div>
          <div style={{ border: "1px solid #3a4049", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column" }}><b>Totals</b><span style={{ color: "#c7ff4a", fontSize: 13, marginTop: 4 }}>Reconciled</span></div>
        </div>
      </div>
    </div>,
    { ...size }
  );
}
