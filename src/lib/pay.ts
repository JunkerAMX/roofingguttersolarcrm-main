export const WORKER_PAY_CENTS = 15000;

export function formatWorkerPay(currency = "") {
  return formatCents(WORKER_PAY_CENTS, currency);
}

export function formatCents(cents: number, currency = "") {
  const amount = `$${(cents / 100).toFixed(2)}`;
  return currency ? `${amount} ${currency}` : amount;
}
