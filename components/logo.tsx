import Link from "next/link";

export function Logo() {
  return <Link href="/" className="logo" aria-label="Foldline home"><span className="logoMark" aria-hidden>F</span><span>Foldline</span></Link>;
}
