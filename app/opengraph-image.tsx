import { ImageResponse } from "next/og";

export const alt = "Foldline — Messy documents in. Trusted data out.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f4ee", color: "#101217", padding: 72, fontFamily: "sans-serif", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 27, fontWeight: 800 }}><div style={{ width: 46, height: 46, borderRadius: 11, background: "#101217", color: "#c7ff4a", display: "flex", alignItems: "center", justifyContent: "center" }}>F</div>Foldline</div>
        <div style={{ fontSize: 78, lineHeight: 0.96, letterSpacing: -4, fontWeight: 800, marginTop: 72 }}>Messy documents in.<br/>Trusted data out.</div>
        <div style={{ fontSize: 27, color: "#626873", marginTop: 30 }}>Review exceptions, not every field.</div>
      </div>
      <div style={{ width: 330, height: 430, borderRadius: 28, background: "#101217", color: "white", padding: 28, transform: "rotate(3deg)", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 15, color: "#aeb3bb", display: "flex", justifyContent: "space-between" }}><span>invoice.pdf</span><span style={{ color: "#c7ff4a" }}>12% risk</span></div>
        <div style={{ marginTop: 38, background: "#23272f", borderRadius: 17, padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ fontSize: 12, color: "#aeb3bb" }}>REVIEW BY EXCEPTION</div>
          <div style={{ border: "1px solid #3a4049", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column" }}><b>Supplier BIN</b><span style={{ color: "#c7ff4a", fontSize: 13, marginTop: 4 }}>✓ 99% confidence</span></div>
          <div style={{ border: "1px solid #665d25", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column", background: "#302d15" }}><b>VAT amount</b><span style={{ color: "#ffd454", fontSize: 13, marginTop: 4 }}>Needs review · 68%</span></div>
          <div style={{ border: "1px solid #3a4049", borderRadius: 12, padding: 15, display: "flex", flexDirection: "column" }}><b>Invoice total</b><span style={{ color: "#c7ff4a", fontSize: 13, marginTop: 4 }}>✓ Math reconciled</span></div>
        </div>
      </div>
    </div>,
    { ...size }
  );
}
