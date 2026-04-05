/** Convert GGUF quant names to human-readable bit labels. */
export function formatQuant(quant: string): string {
  const q = quant.toUpperCase();
  if (q.includes('Q2') || q.includes('IQ2')) return '2-bit';
  if (q.includes('Q3') || q.includes('IQ3')) return '3-bit';
  if (q.includes('Q4') || q.includes('IQ4')) return '4-bit';
  if (q.includes('Q5') || q.includes('IQ5')) return '5-bit';
  if (q.includes('Q6')) return '6-bit';
  if (q.includes('Q8')) return '8-bit';
  if (q.includes('F16') || q.includes('BF16')) return '16-bit';
  if (q.includes('F32')) return '32-bit';
  return quant;
}
