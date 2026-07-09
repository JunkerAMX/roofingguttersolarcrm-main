export const WORKER_PAY_RATE = 0.6;

export function calculateWorkerPayCents(price_cents?: number | null): number {
  if (!price_cents || price_cents <= 0) return 0;
  return Math.round(price_cents * WORKER_PAY_RATE);
}

export function formatCents(cents: number, currency = "") {
  const amount = `$${(cents / 100).toFixed(2)}`;
  return currency ? `${amount} ${currency}` : amount;
}

export function formatWorkerPay(price_cents?: number | null, currency = "") {
  return formatCents(calculateWorkerPayCents(price_cents), currency);
}
