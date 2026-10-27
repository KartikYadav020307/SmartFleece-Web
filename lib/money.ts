// Money helpers. All amounts are integers in minor units (paise/cents),
// mirroring the grams-for-weights rule. Display uses the mill's configured
// currency.

export type CurrencyConfig = { currencyCode: string; currencySymbol: string };

export function formatMoney(minor: number, cfg: CurrencyConfig): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: cfg.currencyCode,
      currencyDisplay: "narrowSymbol",
    }).format(major);
  } catch {
    // Unknown currency code to Intl — fall back to the configured symbol.
    return `${cfg.currencySymbol}${major.toFixed(2)}`;
  }
}

/** Half-up rounding to integer minor units. */
export function roundMinor(amount: number): number {
  return Math.floor(amount + 0.5);
}
