export function formatGhs(pesewas: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(pesewas / 100);
}
