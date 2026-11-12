import { useEffect, useState } from "react";
import { api, type LoginResult } from "../api/client";

const RESEND_SECONDS = 30;

/** Email → 6-digit code. No password; the email is not tied to any Meralco account. */
export function SignIn({ onLogin }: { onLogin: (session: LoginResult) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function send() {
    setBusy(true); setError(null);
    try {
      await api.startSignIn(email.trim());
      setStep("code"); setCode(""); setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hindi maipadala ang code ngayon.");
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError(null);
    try {
      const { token } = await api.verifySignIn(email.trim(), code);
      const households = await api.households(token);
      onLogin({ token, households });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hindi makapag-sign in ngayon.");
    } finally { setBusy(false); }
  }

  if (step === "email") {
    return <section className="card flow">
      <h2>Sign in</h2>
      <p className="muted">Type your email and we'll send a 6-digit code. No password needed.</p>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>;
  }

  return <section className="card flow">
    <button type="button" className="back" aria-label="Back" onClick={() => { setStep("email"); setError(null); }}>‹</button>
    <h2>Check your email</h2>
    <p className="muted">We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 10 minutes.</p>
    <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
      <label>Verification code
        <input className="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </label>
      <p className="muted small">
        Didn't receive it? Check spam, or{" "}
        {resendIn > 0
          ? <>resend code in 0:{String(resendIn).padStart(2, "0")}</>
          : <button type="button" className="link" disabled={busy} onClick={() => void send()}>resend code</button>}
      </p>
      <button className="primary" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <button type="button" className="ghost" onClick={() => { setStep("email"); setCode(""); setError(null); }}>Use a different email</button>
  </section>;
}
