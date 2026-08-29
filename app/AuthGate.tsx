"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ALLOWED_EMAIL, supabaseBrowser } from "./lib/supabase-browser";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const notAllowed = Boolean(session && session.user.email?.toLowerCase() !== ALLOWED_EMAIL.toLowerCase());

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => setSession(null));
    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (notAllowed) supabaseBrowser.auth.signOut();
  }, [notAllowed]);

  async function sendMagicLink() {
    setError("");
    if (!email.trim()) return setError("Enter your email first.");
    setIsSending(true);
    try {
      const { error: sendError } = await supabaseBrowser.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (sendError) throw sendError;
      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the sign-in link.");
    } finally {
      setIsSending(false);
    }
  }

  if (session === undefined) return null;

  if (session && !notAllowed) {
    return <>{children}<button className="sign-out-button" onClick={() => supabaseBrowser.auth.signOut()}>Sign out</button></>;
  }

  return (
    <main className="auth-gate">
      <div className="auth-card">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span><b>MuseFlow</b><small>STORY STUDIO</small></span></div>
        {notAllowed ? (
          <>
            <h1>This workspace is private.</h1>
            <p>That email isn&rsquo;t on the list for this MuseFlow instance.</p>
          </>
        ) : linkSent ? (
          <>
            <h1>Check your email.</h1>
            <p>We sent a sign-in link to {email}. Open it on this device to continue.</p>
          </>
        ) : (
          <>
            <h1>Sign in to MuseFlow.</h1>
            <p>Enter your email and we&rsquo;ll send you a one-time sign-in link.</p>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="Email" onKeyDown={(event) => event.key === "Enter" && sendMagicLink()} />
            {error && <span className="auth-error">{error}</span>}
            <button className="primary-button" onClick={sendMagicLink} disabled={isSending}>{isSending ? "Sending…" : "Send sign-in link"}</button>
          </>
        )}
      </div>
    </main>
  );
}
