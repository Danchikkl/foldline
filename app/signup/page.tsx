import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Foldline workspace and process up to 10 documents free.",
  robots: { index: false, follow: true },
};

export default function Signup(){return <main className="authPage"><div className="authBrand"><Logo/></div><div className="authCard"><span className="eyebrow">10 documents free</span><h1>Create a cleaner document workflow.</h1><p>No card required. Email verification is enabled by default.</p><AuthForm mode="signup"/></div></main>}
