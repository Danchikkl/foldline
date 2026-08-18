import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function MobileCta() {
  return <div className="mobileCta" aria-label="Start Foldline">
    <div><strong>10 documents free</strong><span>No card required</span></div>
    <Link href="/signup" className="button buttonAccent buttonSmall">Start <ArrowRight size={15}/></Link>
  </div>;
}
