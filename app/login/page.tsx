import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Foldline document workspace.",
  robots: { index: false, follow: true },
};

export default function Login(){return <main className="authPage"><div className="authBrand"><Logo/></div><div className="authCard"><span className="eyebrow">Welcome back</span><h1>Open your workspace.</h1><p>Continue reviewing documents and exceptions.</p><AuthForm mode="login"/></div></main>}
