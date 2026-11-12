import { useState } from "react";
import { api, type LoginResult } from "../api";

export function MyMeralcoLogin({ onLogin }: { onLogin: (session: LoginResult) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <section className="card">
    <h2>Mag-login gamit ang My Meralco</h2>
    <p className="muted">Piliin ang Household mo at tingnan ang 12-Bill History. Demo login lamang ito.</p>
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const session = await api.login(email, password); setPassword(""); onLogin(session); }
      catch (err) { setError(err instanceof Error ? err.message : "Hindi makapag-login ngayon."); }
      finally { setBusy(false); }
    }}>
      <label>Email<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? "Nagla-login…" : "Mag-login"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <details className="demo-login"><summary>Gamitin ang demo login</summary><p>Email: demo@example.com<br />Password: kuryenteko-demo</p></details>
  </section>;
}
