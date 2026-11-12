import { useEffect, useRef, useState } from "react";
import { ApiError, api, type CodeSent } from "../../api/client";

/** Icons drawn as in the mockup (stroke, currentColor). */
const ICON = {
  back: "m15 18-6-6 6-6",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  star: "m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  check: "m5 12 5 5 9-10",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};
export function Icon({ d, size = 20, width = 2 }: { d: string; size?: number; width?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
export const BackButton = ({ onClick, label = "Back" }: { onClick: () => void; label?: string }) =>
  <button type="button" className="screen-back" aria-label={label} onClick={onClick}><Icon d={ICON.back} size={22} /></button>;
export { ICON };

function Brand() {
  return <div className="brand"><span className="brand-mark"><img src="/icon-192.png" alt="" /></span>Eelio</div>;
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const normalizePhone = (raw: string) => `+63${raw.replace(/\D/g, "").replace(/^0/, "").replace(/^63/, "")}`;
const RESEND_SECONDS = 120;

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

/** 1 · Sign up: email + contact number (like My Meralco). */
export function SignUp({ onCodeSent, onSignIn }: { onCodeSent: (email: string, sent: CodeSent) => void; onSignIn: () => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneOk = /^9\d{9}$/.test(phone.replace(/\D/g, "").replace(/^0/, "").replace(/^63/, ""));

  async function submit() {
    setBusy(true); setError(null);
    try { onCodeSent(email.trim(), await api.signUp(email.trim(), normalizePhone(phone))); }
    catch (err) { setError(message(err, "We couldn't create your account right now.")); }
    finally { setBusy(false); }
  }

  return <form className="screen top" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <Brand />
    <div className="screen-intro">
      <h1 className="big">Create your account</h1>
      <p className="lead">See why your bill changed, check it against Meralco's own figures, and earn rewards when you use less.</p>
    </div>
    <ul className="features">
      <li><span className="feature-icon"><Icon d={ICON.receipt} size={16} width={2.2} /></span>Every charge explained in plain words</li>
      <li><span className="feature-icon"><Icon d={ICON.chart} size={16} width={2.2} /></span>Scan one bill, get 12 months of history</li>
      <li><span className="feature-icon"><Icon d={ICON.star} size={16} width={2.2} /></span>Points for verified savings</li>
    </ul>
    <div className="screen-bottom">
      <label className="field-label" htmlFor="signup-email">Email address</label>
      <input id="signup-email" className="input-lg" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="field-label" htmlFor="signup-phone">Contact number</label>
      <div className="phone-row">
        <span className="phone-prefix" aria-hidden="true">+63</span>
        <input id="signup-phone" className="input-lg" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="917 123 4567" required maxLength={14}
          value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy || !email.trim() || !phoneOk}>{busy ? "Creating…" : "Create account"}</button>
      <p className="screen-switch">Already have an account? <button type="button" className="link" onClick={onSignIn}>Sign in</button></p>
      <p className="fine">We'll text you a 6-digit code, then email you a link to create your password.<br />By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy Notice</a>.</p>
    </div>
  </form>;
}

/** 6 boxes; typing or pasting fills them in order. */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = (value.slice(0, i) + digits).slice(0, 6);
      onChange(next);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const at = Math.min(i, value.length);
    const next = digits ? (value.slice(0, at) + digits + value.slice(at + 1)).slice(0, 6) : value.slice(0, at) + value.slice(at + 1);
    onChange(next);
    if (digits) refs.current[Math.min(at + 1, 5)]?.focus();
  };
  return <div className="otp-grid" role="group" aria-labelledby="otp-label">
    {Array.from({ length: 6 }, (_, i) => (
      <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
        aria-label={`Digit ${i + 1}`} value={value[i] ?? ""} maxLength={i === 0 ? 6 : 1}
        onChange={(e) => set(i, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus(); }} />
    ))}
  </div>;
}

/** 2 · One-time code sent by SMS (or by email). */
export function OtpCode({ email, sent, onVerified, onBack }: {
  email: string; sent: CodeSent; onVerified: (result: { sentTo: string; expiresInHours: number; demoLink?: string }) => void; onBack: () => void;
}) {
  const [delivery, setDelivery] = useState(sent);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, restart] = useCountdown(RESEND_SECONDS);

  async function verify() {
    setBusy(true); setError(null);
    try { onVerified(await api.verifyCode(email, code)); }
    catch (err) { setError(message(err, "We couldn't check the code right now.")); }
    finally { setBusy(false); }
  }
  async function resend(channel: "sms" | "email") {
    setError(null);
    try { setDelivery(await api.resendCode(email, channel)); setCode(""); restart(); }
    catch (err) { setError(message(err, "We couldn't send a new code.")); }
  }

  return <form className="screen" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
    <BackButton onClick={onBack} />
    <span className="icon-tile"><Icon d={delivery.channel === "sms" ? ICON.phone : ICON.mail} size={26} /></span>
    <div className="screen-intro">
      <h1>Enter the code we sent</h1>
      <p className="lead">We sent a 6-digit code {delivery.channel === "sms" ? "by SMS" : "by email"} to <strong>{delivery.sentTo}</strong>.</p>
    </div>
    <div className="screen-group">
      <span className="field-label" id="otp-label">One-time code</span>
      <CodeBoxes value={code} onChange={setCode} />
      <p className="small muted">Didn't get it?{" "}
        {left > 0
          ? <>Resend code in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</>
          : <button type="button" className="link" onClick={() => void resend(delivery.channel)}>Resend code</button>}
      </p>
    </div>
    {delivery.channel === "sms" && <button type="button" className="btn-outline" onClick={() => void resend("email")}>
      <Icon d={ICON.mail} size={18} /> Send the code by email instead
    </button>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="screen-bottom">
      <button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify"}</button>
      <button type="button" className="btn-text" onClick={onBack}>Use a different number</button>
    </div>
  </form>;
}

/** 3 · Verify your email: the link that leads to Create password. */
export function VerifyEmail({ email, demoLink, onBack, onDifferentEmail }: {
  email: string; demoLink?: string; onBack: () => void; onDifferentEmail: () => void;
}) {
  return <section className="screen" aria-labelledby="verify-email-title">
    <BackButton onClick={onBack} />
    <span className="icon-tile"><Icon d={ICON.mail} size={26} /></span>
    <div className="screen-intro">
      <h1 id="verify-email-title">Verify your email</h1>
      <p className="lead">Your mobile number is confirmed. We sent a verification link to <strong>{email}</strong>. Tap it to verify your email and create your password.</p>
    </div>
    <ol className="progress-card">
      <li className="done"><span className="dot"><Icon d={ICON.check} size={14} width={2.8} /></span>Mobile number verified</li>
      <li className="current"><span className="dot">2</span><span>Open the email and tap <strong>Verify email</strong></span></li>
      <li><span className="dot">3</span>Create your password</li>
    </ol>
    <p className="small muted">The link expires in 24 hours. Didn't get it? Check spam, or go back and request a new code.</p>
    <div className="screen-bottom">
      {demoLink
        ? <a className="btn-primary" href={demoLink}><Icon d={ICON.external} size={18} /> Open Gmail</a>
        : <a className="btn-primary" href="https://mail.google.com/" target="_blank" rel="noreferrer"><Icon d={ICON.external} size={18} /> Open Gmail</a>}
      <button type="button" className="btn-text" onClick={onDifferentEmail}>Use a different email</button>
    </div>
  </section>;
}

const RULES: { label: string; test: (pw: string, confirm: string) => boolean }[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "A letter and a number", test: (pw) => /[A-Za-z]/.test(pw) && /\d/.test(pw) },
  { label: "Both passwords match", test: (pw, c) => pw.length > 0 && pw === c },
];

/** 4 · Create your password, opened from the email link (#/create-password/<token>). */
export function CreatePassword({ token, onDone, onBack }: { token: string; onDone: (sessionToken: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.checkLink(token).then((r) => { if (active) setEmail(r.email); })
      .catch((err) => { if (active) setLinkError(message(err, "This link is invalid or has expired.")); });
    return () => { active = false; };
  }, [token]);

  const ok = RULES.every((r) => r.test(password, confirm));
  async function submit() {
    setBusy(true); setError(null);
    try { onDone((await api.createPassword(token, password)).token); }
    catch (err) { setError(message(err, "We couldn't save your password.")); }
    finally { setBusy(false); }
  }

  if (linkError) return <section className="screen">
    <BackButton onClick={onBack} />
    <div className="screen-intro"><h1>Link not valid</h1><p className="lead">{linkError}</p></div>
    <div className="screen-bottom"><button type="button" className="btn-primary" onClick={onBack}>Back to sign up</button></div>
  </section>;

  return <form className="screen" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <div className="screen-head">
      <BackButton onClick={onBack} />
      {email && <span className="pill-ok"><Icon d={ICON.check} size={12} width={3} /> Email verified</span>}
    </div>
    <div className="screen-intro">
      <h1>Create your password</h1>
      <p className="lead">{email ? <>You'll sign in with <strong>{email}</strong> and this password.</> : "Checking your link…"}</p>
    </div>
    <div className="screen-group">
      <label className="field-label" htmlFor="new-password">Password</label>
      <div className="pw-wrap">
        <input id="new-password" className="input-lg" type={show ? "text" : "password"} autoComplete="new-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="pw-toggle" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}><Icon d={ICON.eye} /></button>
      </div>
      <label className="field-label" htmlFor="confirm-password">Confirm password</label>
      <input id="confirm-password" className="input-lg" type={show ? "text" : "password"} autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
    </div>
    <ul className="pw-rules" aria-label="Password rules">
      {RULES.map((r) => {
        const met = r.test(password, confirm);
        return <li key={r.label} className={met ? "met" : ""}><Icon d={met ? ICON.check : "M12 12h.01"} size={16} width={2.6} />{r.label}<span className="sr-only">{met ? " (done)" : " (to do)"}</span></li>;
      })}
    </ul>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="screen-bottom">
      <button className="btn-primary" disabled={busy || !ok || !email}>{busy ? "Saving…" : "Create password"}</button>
      <p className="fine">Next, scan your latest bill to link your Meralco account.</p>
    </div>
  </form>;
}

/** Sign in (returning user): Gmail address + password → Home. */
export function SignIn({ notice, onSignedIn, onSignUp }: { notice?: string | null; onSignedIn: (token: string) => void; onSignUp: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try { onSignedIn((await api.signIn(email.trim(), password)).token); }
    catch (err) { setError(err instanceof ApiError && err.status === 401 ? err.message : message(err, "We couldn't sign you in right now.")); }
    finally { setBusy(false); }
  }

  return <form className="screen top" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <Brand />
    <div className="screen-intro spaced">
      <h1 className="big">Welcome back</h1>
      <p className="lead">Sign in to see your latest bill, your missions and your points.</p>
    </div>
    {notice && <p role="status" className="notice-inline">{notice}</p>}
    <div className="screen-bottom">
      <label className="field-label" htmlFor="signin-email">Gmail address</label>
      <input id="signin-email" className="input-lg" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="label-row">
        <label className="field-label" htmlFor="signin-password">Password</label>
        <button type="button" className="link small" onClick={() => setForgot((v) => !v)}>Forgot password?</button>
      </div>
      <div className="pw-wrap">
        <input id="signin-password" className="input-lg" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="pw-toggle" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}><Icon d={ICON.eye} /></button>
      </div>
      {forgot && <p className="small muted" role="status">Password reset isn't available in the demo yet.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy || !email.trim() || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="screen-switch">Don't have an account? <button type="button" className="link" onClick={onSignUp}>Sign up</button></p>
    </div>
  </form>;
}

type Step =
  | { name: "signup" }
  | { name: "otp"; email: string; sent: CodeSent }
  | { name: "verify"; email: string; demoLink?: string }
  | { name: "signin" };

/** Signed out: Sign up → code → verify email (→ Create password from the link), or Sign in. */
export function AuthFlow({ initial, notice, onSignedIn }: { initial: "signup" | "signin"; notice?: string | null; onSignedIn: (token: string) => void }) {
  const [step, setStep] = useState<Step>({ name: initial } as Step);
  useEffect(() => { setStep({ name: initial } as Step); }, [initial]);
  const toSignIn = () => { window.location.hash = "/signin"; setStep({ name: "signin" }); };
  const toSignUp = () => { window.location.hash = "/signup"; setStep({ name: "signup" }); };

  switch (step.name) {
    case "signin":
      return <SignIn notice={notice} onSignedIn={onSignedIn} onSignUp={toSignUp} />;
    case "otp":
      return <OtpCode email={step.email} sent={step.sent} onBack={toSignUp}
        onVerified={(r) => setStep({ name: "verify", email: r.sentTo, demoLink: r.demoLink })} />;
    case "verify":
      return <VerifyEmail email={step.email} demoLink={step.demoLink} onBack={toSignUp} onDifferentEmail={toSignUp} />;
    default:
      return <SignUp onSignIn={toSignIn} onCodeSent={(email, sent) => setStep({ name: "otp", email, sent })} />;
  }
}
