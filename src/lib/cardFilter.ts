export type CardNote = {
  text: string;
  /** Product key this note belongs under. */
  section: string;
  /** Set when the note is about one sport. Empty means the whole section. */
  sport: string | null;
};

/** A section status note with no sport still shows when that section is the one open. */
export function noteVisible(note: CardNote, product: string | null, sport: string): boolean {
  if (product && note.section !== product) return false;
  if (!sport || sport === "All") return true;
  if (note.sport) return note.sport === sport;
  return product === note.section;
}

export function sportCounts(
  plays: { sport: string }[],
  notes: CardNote[],
  product: string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const play of plays) {
    if (!play.sport || play.sport === "Other") continue;
    counts.set(play.sport, (counts.get(play.sport) ?? 0) + 1);
  }
  for (const note of notes) {
    if (!note.sport || note.sport === "Other") continue;
    if (product && note.section !== product) continue;
    if (!counts.has(note.sport)) counts.set(note.sport, 0);
  }
  return counts;
}
