import Link from "next/link";
import { FileText, LayoutDashboard, ClipboardCheck, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";

export function DashboardShell({ children, email }: { children: React.ReactNode; email: string }) {
  return <div className="appShell"><aside className="sidebar"><Logo /><nav className="sideNav"><Link href="/dashboard"><LayoutDashboard size={17}/>Workspace</Link><Link href="/dashboard#documents"><FileText size={17}/>Documents</Link><Link href="/settings/billing"><ClipboardCheck size={17}/>Preorder</Link></nav><div className="sideFooter"><div className="userPill"><span className="avatar">{email.slice(0,1).toUpperCase()}</span><span className="userEmail">{email}</span></div><form action="/auth/signout" method="post"><button className="iconText" type="submit"><LogOut size={15}/>Sign out</button></form></div></aside><main className="appMain">{children}</main></div>;
}
