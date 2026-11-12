/** Centavos → "₱1,234.56"; `signed` adds "+" to positives. Negatives use a real minus sign. */
export const peso = (centavos: number, signed = false) => {
  const s = (Math.abs(centavos) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = centavos < 0 ? "−" : signed && centavos > 0 ? "+" : "";
  return `${sign}₱${s}`;
};
