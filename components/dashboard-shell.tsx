import Link from "next/link";
import { FileSpreadsheet, FileText, LayoutDashboard, ClipboardCheck, LockKeyhole, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";

/**
 * `hardNav` is set on private-workspace pages: every link out is a full page
 * load, so the strict vault policy never follows the user to pages that need a
 * looser one. Links INTO the vault are always full loads, so its policy applies.
 */
export function DashboardShell({ children, email, hardNav = false }: { children: React.ReactNode; email: string; hardNav?: boolean }) {
  const Nav = ({ href, children: label }: { href: string; children: React.ReactNode }) => (hardNav ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>);
  return <div className="appShell"><aside className="sidebar"><Logo /><nav className="sideNav"><Nav href="/dashboard"><LayoutDashboard size={17}/>Workspace</Nav><Nav href="/dashboard#documents"><FileText size={17}/>Documents</Nav><a href="/vault"><LockKeyhole size={17}/>Private workspace</a><a href="/vault/audit"><FileSpreadsheet size={17}/>Paid-twice audit</a><Nav href="/settings/billing"><ClipboardCheck size={17}/>Preorder</Nav></nav><div className="sideFooter"><div className="userPill"><span className="avatar">{email.slice(0,1).toUpperCase()}</span><span className="userEmail">{email}</span></div><form action="/auth/signout" method="post"><button className="iconText" type="submit"><LogOut size={15}/>Sign out</button></form></div></aside><main className="appMain">{children}</main></div>;
}
