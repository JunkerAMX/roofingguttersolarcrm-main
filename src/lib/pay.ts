export const WORKER_PAY_CENTS = 15000;

export function formatWorkerPay(currency = "") {
  const amount = `$${(WORKER_PAY_CENTS / 100).toFixed(2)}`;
  return currency ? `${amount} ${currency}` : amount;
}
