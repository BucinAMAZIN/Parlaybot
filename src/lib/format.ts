export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function edgePercent(edge: number): string {
  return `${(edge * 100).toFixed(1)}%`;
}

export function formatSigned(n: number, digits = 1): string {
  const text = n.toFixed(digits);
  return n > 0 ? `+${text}` : text;
}
