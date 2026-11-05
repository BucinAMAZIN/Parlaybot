/**
 * Decide which new-pick and ticket-lock alerts to send.
 * The first saved snapshot is a baseline: nothing already in the feed is announced.
 * Identity ignores price and array order. Capper plays are included.
 */

export type DeskRow = Record<string, unknown>;

export type AlertEvent = {
  kind: "pick" | "lock";
  id: string;
  title: string;
  body: string;
  url: "#today";
  tag: string;
};

export type Baseline = {
  bootstrapped: boolean;
  picks: string[];
  locks: Record<string, boolean>;
  sent: string[];
};

const MONEY = /[$€£]|\bprofit\b|\bunits?\b|\bbankroll\b|win rate|[+-]\d+(?:\.\d+)?|\d+\s*u\b/i;

export function scrub(value: string, max = 120): string {
  const clean = value.replace(MONEY, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, max);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function rows(value: unknown): DeskRow[] {
  return Array.isArray(value) ? value.filter((item): item is DeskRow => !!item && typeof item === "object") : [];
}

function row(value: unknown): DeskRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DeskRow) : null;
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[+-]\d+(?:\.\d+)?/g, " ").replace(/[^a-z0-9 @]+/g, " ").replace(/\s+/g, " ").trim();
}

function placeholder(pick: string): boolean {
  return !pick || /builds at|not enough|no pick today|not at \d/i.test(pick);
}

function pickId(section: string, item: DeskRow): string {
  const sid = str(item.hr_sid);
  if (/^\d{4,}$/.test(sid)) return `hr:${sid}`;
  const who = norm(str(item.player) || str(item.pick) || str(item.name));
  const market = norm(str(item.market) || str(item.prop) || str(item.fam));
  if (!who || placeholder(who)) return "";
  return `pick:${section}:${who}:${market}`;
}

function pickLabel(item: DeskRow): string {
  const who = str(item.player) || str(item.pick) || str(item.name);
  const market = str(item.market) || str(item.prop) || str(item.fam);
  return scrub([who, market].filter(Boolean).join(" · "), 90);
}

function addPicks(out: Map<string, string>, section: string, list: DeskRow[]) {
  for (const item of list) {
    if (placeholder(str(item.pick) || str(item.player))) continue;
    const id = pickId(section, item);
    if (!id || out.has(id)) continue;
    out.set(id, pickLabel(item) || "New pick");
  }
}

export function collectPicks(raw: unknown): Map<string, string> {
  const data = row(raw) ?? {};
  const today = row(data.today) ?? {};
  const slate = str(today.date);
  const out = new Map<string, string>();
  const heist = row(data.heist);
  addPicks(out, "heist", rows(heist?.legs));
  const safe = row(data.safe100);
  addPicks(out, "safe", rows(safe?.legs ?? safe?.plays));
  for (const ticket of rows(today.tickets)) {
    const name = norm(str(ticket.name)) || "ticket";
    const legs = rows(ticket.legs);
    if (legs.length) addPicks(out, name, legs);
    else if (str(ticket.pick) || str(ticket.player)) addPicks(out, name, [ticket]);
  }
  const sports = row(today.sports) ?? {};
  for (const [sport, value] of Object.entries(sports)) {
    const board = row(value);
    if (!board) continue;
    if (row(board.potd)) addPicks(out, `potd:${sport}`, [row(board.potd)!]);
    const parlay = row(board.parlay);
    if (parlay) addPicks(out, `parlay:${sport}`, rows(parlay.legs).length ? rows(parlay.legs) : [parlay]);
  }
  addPicks(out, "edge", rows(row(data.edge)?.picks));
  addPicks(out, "legday", rows(row(data.legday)?.board));
  for (const capper of rows(data.cappers)) {
    const name = norm(str(capper.name)) || "capper";
    addPicks(out, `capper:${name}`, rows(capper.today));
  }
  const blood = row(data.first_blood);
  if (blood && (!slate || str(blood.date) === slate)) addPicks(out, "first", rows(blood.legs));
  return out;
}

function locked(item: DeskRow | null): boolean {
  if (!item) return false;
  return item.final === true || item.full_locked === true || item.locked === true || !!str(item.locked_at);
}

export function collectLocks(raw: unknown): Record<string, { locked: boolean; title: string }> {
  const data = row(raw) ?? {};
  const today = row(data.today) ?? {};
  const slate = str(today.date);
  const out: Record<string, { locked: boolean; title: string }> = {};
  const heist = row(data.heist);
  if (heist) out["ticket:heist"] = { locked: locked(heist), title: "THE HEIST" };
  const blood = row(data.first_blood);
  if (blood && (!slate || str(blood.date) === slate)) out["ticket:first"] = { locked: locked(blood), title: "First Blood" };
  for (const ticket of rows(today.tickets)) {
    const name = str(ticket.name);
    if (!name) continue;
    out[`ticket:${norm(name)}`] = { locked: locked(ticket), title: scrub(name, 60) || "Ticket" };
  }
  return out;
}

function bundle(kind: "pick" | "lock", title: string, labels: string[], tag: string): AlertEvent {
  const shown = labels.filter(Boolean).slice(0, 3);
  const extra = labels.length - shown.length;
  const body = scrub(`${shown.join(", ")}${extra > 0 ? `, and ${extra} more` : ""}`, 140);
  return { kind, id: tag, title, body: body || title, url: "#today", tag };
}

export function diffFeed(state: Baseline | null, raw: unknown): { events: AlertEvent[]; next: Baseline } {
  const picks = collectPicks(raw);
  const locks = collectLocks(raw);
  const lockFlags = Object.fromEntries(Object.entries(locks).map(([id, value]) => [id, value.locked]));
  if (!state?.bootstrapped) {
    return { events: [], next: { bootstrapped: true, picks: [...picks.keys()], locks: lockFlags, sent: [] } };
  }
  const seen = new Set(state.sent);
  const pickLabels: string[] = [];
  const pickIds: string[] = [];
  for (const [id, label] of picks) {
    const token = `pick:${id}`;
    if (state.picks.includes(id) || seen.has(token)) continue;
    pickIds.push(id);
    pickLabels.push(label);
    seen.add(token);
  }
  const lockLabels: string[] = [];
  for (const [id, value] of Object.entries(locks)) {
    const token = `lock:${id}`;
    const previous = state.locks[id];
    if (!value.locked || previous !== false || seen.has(token)) continue;
    lockLabels.push(value.title);
    seen.add(token);
  }
  const events: AlertEvent[] = [];
  if (pickLabels.length) events.push(bundle("pick", "New pick", pickLabels, "picks"));
  if (lockLabels.length) events.push(bundle("lock", "Ticket locked", lockLabels, "locks"));
  return {
    events,
    next: {
      bootstrapped: true,
      picks: [...picks.keys()],
      locks: lockFlags,
      sent: [...seen].slice(-400),
    },
  };
}

export function payloadIsPrivate(event: AlertEvent): boolean {
  return MONEY.test(`${event.title} ${event.body}`);
}
