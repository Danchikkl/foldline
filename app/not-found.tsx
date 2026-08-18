import Link from "next/link";
import { FileQuestion, ArrowRight } from "lucide-react";

export default function NotFound(){return <main className="notFound"><div className="notFoundIcon"><FileQuestion/></div><span className="eyebrow">404 · document not found</span><h1>That page folded away.</h1><p>The link may be old, private, or simply not exist.</p><div className="heroActions"><Link className="button buttonDark" href="/">Go home <ArrowRight size={16}/></Link><Link className="button buttonGhost" href="/dashboard">Open workspace</Link></div></main>}
