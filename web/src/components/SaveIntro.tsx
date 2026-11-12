/** "Use less power. Get rewarded for it." (mockup screen 8). Smart meter homes earn daily (ADR-0008). */
export function SaveIntro({ onStart, onLater, smart = false }: { onStart: () => void; onLater: () => void; smart?: boolean }) {
  return (
    <section className="flow save-intro" aria-labelledby="save-intro-title">
      <button type="button" className="back" aria-label="Back" onClick={onLater}>‹</button>
      <span className="muted small">Eelio Rewards</span>
      <h2 id="save-intro-title">Use less power. Get rewarded for it.</h2>
      <p className="muted">Every ₱1 you save {smart ? "each day" : "on your bill"} earns 1 point.</p>
      <h3>How it works</h3>
      <ol className="steps">
        <li><span className="step-n">1</span><div><strong>Set up your home <span className="pts">+100 pts</span></strong><p className="muted small">Tap the appliances you have and pick your daily routine. About a minute.</p></div></li>
        <li><span className="step-n">2</span><div><strong>Follow suggested missions</strong><p className="muted small">Simple tips based on your appliances, each with its estimated peso value.</p></div></li>
        {smart ? (
          <li><span className="step-n">3</span><div><strong>Earn points every day</strong><p className="muted small">Your smart meter verifies each day's savings, adjusted for that day's heat. 1 point per ₱1 saved.</p></div></li>
        ) : (
          <li><span className="step-n">3</span><div><strong>Earn points on your next bill</strong><p className="muted small">We verify the savings, adjusted for weather and billing days. 1 point per ₱1 saved.</p></div></li>
        )}
      </ol>
      <h3>Redeem for <span className="tag sample-rewards-badge">Sample rewards</span></h3>
      <ul className="sample-rewards">
        <li><span>₱50 load</span><strong>500 pts</strong></li>
        <li><span>₱100 e-wallet</span><strong>1,000 pts</strong></li>
        <li><span>Store voucher</span><strong>1,500 pts</strong></li>
      </ul>
      <p className="muted small">Welcome points appear in your balance right away and unlock after your first verified savings.</p>
      <button type="button" className="primary" onClick={onStart}>Start setup · earn 100 pts</button>
      <button type="button" className="ghost wide" onClick={onLater}>Maybe later</button>
    </section>
  );
}
