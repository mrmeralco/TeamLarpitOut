/** Centavos → "₱1,234.56"; `signed` adds "+" to positives. Negatives use a real minus sign. */
export const peso = (centavos: number, signed = false) => {
  const s = (Math.abs(centavos) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = centavos < 0 ? "−" : signed && centavos > 0 ? "+" : "";
  return `${sign}₱${s}`;
};

/** Pesos (float) → "₱1,234.56"; `signed` adds "+" to positives. Negatives use a real minus sign. */
export const pesoValue = (pesos: number, signed = false) => {
  const s = Math.abs(pesos).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = pesos < 0 ? "−" : signed && pesos > 0 ? "+" : "";
  return `${sign}₱${s}`;
};
export const maskSin = (sin: string) => "•".repeat(Math.max(4, sin.length - 4)) + sin.slice(-4);
export const monthLabel = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
  ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : period;
