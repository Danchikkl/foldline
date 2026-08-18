"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    if (mode === "signup" && password.length < 10) return setError("Use at least 10 characters for your password.");
    setLoading(true);
    const supabase = createClient();
    if (mode === "signup") {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name.trim().slice(0, 100) }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) setError(authError.message);
      else if (authData.session) { router.push("/dashboard"); router.refresh(); }
      else { router.push("/thank-you?type=signup"); router.refresh(); }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message); else { router.push("/dashboard"); router.refresh(); }
    }
    setLoading(false);
  }

  return <form className="authForm" onSubmit={submit}>
    {mode === "signup" && <label>Full name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>}
    <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 10 : undefined} /></label>
    {error && <div className="formError" role="alert">{error}</div>}
    {message && <div className="formSuccess" role="status">{message}</div>}
    <button className="button buttonAccent buttonWide" disabled={loading}>{loading ? "Working…" : mode === "signup" ? "Create workspace" : "Log in"}</button>
    <p className="authSwitch">{mode === "signup" ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New to Foldline? <Link href="/signup">Create account</Link></>}</p>
  </form>;
}
