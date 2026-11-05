/** A published prop line. Parsing the text does not reprice or re-ladder it. */

export type PropLine = {
  player: string;
  line: number;
  under: boolean;
  /** N+ uses the published number. 5+ is 5, not a bought 4.5. */
  plus: boolean;
  market: string;
};

function clean(name: string): string {
  return name.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Reads the line the file already printed.
 * Over 13.5, 5+, o2.5, and `4.5 Receptions O` stay on that published number.
 */
export function propLine(name: string): PropLine | null {
  const text = clean(name);
  let match = text.match(/^(.+?)\s+(Over|Under)\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (match) {
    return { player: match[1], line: Number(match[3]), under: /^under/i.test(match[2]), plus: false, market: match[4] };
  }
  match = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\+\s+(.+)$/i);
  if (match) return { player: match[1], line: Number(match[2]), under: false, plus: true, market: match[3] };
  match = text.match(/^(.+?)\s+([ou])(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (match) {
    return { player: match[1], line: Number(match[3]), under: match[2].toLowerCase() === "u", plus: false, market: match[4] };
  }
  match = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+([ou])$/i);
  if (match) {
    return { player: match[1], line: Number(match[2]), under: match[4].toLowerCase() === "u", plus: false, market: match[3] };
  }
  return null;
}
