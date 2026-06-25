const pkrFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPKR(amount: number): string {
  return pkrFormatter.format(amount)
}
