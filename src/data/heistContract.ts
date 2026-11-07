/**
 * Production heist-originals cutover, staged until effective_at_et is set.
 * Book buttons come only from a VERIFIED per-original projection that matches
 * heist_original_links for that same original. Legacy converted hints are not links.
 */

export type PrepBook = {
  state: string;
  reason: string;
  url?: string;
  checkedAt?: string;
};

export type PrepPick = {
  id: string;
  capperId: string;
  rawPick: string;
  posted: string;
  legacyCell: string;
  prop: string;
  sport: string;
  sourceIds: string;
  ticketId: string;
  legCount: number;
  grade: string;
  gradeDetail: string;
  gradeReason: string;
  hr: PrepBook;
  dk: PrepBook;
};

export type PrepGroup = { capperId: string; picks: PrepPick[] };

export type PrepPlay = {
  recordId: string;
  originalId: string;
  pick: string;
  grade: string;
  detail: string;
  odds: string;
};

export type PrepCount = {
  w: number;
  l: number;
  p: number;
  voided: number;
  pending: number;
  unavailable: number;
  rows: number;
};

export type PrepTree = {
  capperId: string;
  dropped: boolean;
  profile: string;
  profileW: number | null;
  profileL: number | null;
  profileP: number | null;
  pct: number | null;
  rows: string;
  counts: PrepCount;
  props: { propId: string; prop: string; totals: string; counts: PrepCount; days: { date: string; count: number; totals: string; plays: PrepPlay[] }[] }[];
};

export type PrepAlt = {
  id: string;
  pick: string;
  date: string;
  grade: string;
  counted: boolean;
  reason: string;
};

export type HeistPrep = {
  policyVersion: string;
  activationState: string;
  effectiveAt: string | null;
  decisionsReceivedAt: string;
  activeCappers: string[];
  droppedCappers: string[];
  conversionCappers: string[];
  date: string;
  groups: PrepGroup[];
  pickCount: number;
  verifiedHr: number;
  verifiedDk: number;
  linkState: string;
  pooledState: string;
  pooledRows: number;
  personalActive: string;
  personalEntryCount: number;
  countedPersonal: number;
  personal: PrepAlt[];
  tree: PrepTree[];
  playCount: number;
  retireReady: boolean;
  blockers: string[];
  decisions: string[];
  pointInTime: string;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const SIX = ["heist_originals", "results_cappers", "heist_pooled_originals", "personal_heist_alt", "heist_originals_meta", "heist_original_links"] as const;

/** Sport on the first line, market on the second. Parentheticals stay in the market name. */
export function propFace(prop: string): { sport: string; market: string } {
  const split = prop.match(/^(\S+)\s+(.+)$/);
  if (!split) return { sport: "", market: prop };
  const market = split[2].replace(/\(([^)]+)\)/g, " $1").replace(/\s+/g, " ").trim();
  return { sport: split[1], market: market ? market.charAt(0).toUpperCase() + market.slice(1) : split[1] };
}

function countOf(value: unknown): PrepCount {
  const row = isRow(value) ? value : {};
  return {
    w: num(row.W) ?? 0,
    l: num(row.L) ?? 0,
    p: num(row.P) ?? 0,
    voided: num(row.Void) ?? 0,
    pending: num(row.Pending) ?? 0,
    unavailable: num(row.Unavailable) ?? 0,
    rows: num(row.rows) ?? 0,
  };
}

function totals(value: unknown): string {
  const row = countOf(value);
  return `${row.w}-${row.l}${row.p ? `-${row.p}` : ""} · void ${row.voided} · pending ${row.pending} · unavailable ${row.unavailable} · ${row.rows} rows`;
}

function actionable(book: unknown, link: Row, side: "hr" | "dk"): PrepBook {
  const row = isRow(book) ? book : {};
  const state = str(row.state) || "UNVERIFIED";
  const fallback = side === "hr" ? str(link.hr_why) : str(link.dk_why);
  const reason = str(row.reason) || fallback || state;
  const sid = str(row.sid);
  const url = str(row.url);
  const verified =
    state === "VERIFIED" &&
    row.audit_verdict === "VERIFIED" &&
    row.absent === false &&
    Boolean(sid && url && str(row.fingerprint) && str(row.verified_at_et) && str(row.audit_path));
  const linkSid = side === "hr" ? str(link.hr_sid) : str(link.dk_sid);
  const linkUrl = side === "hr" ? str(link.hr_link) : str(link.dk_link);
  const matched = verified && linkSid === sid && linkUrl === url;
  const singleDk = side !== "dk" || (/\/event\//.test(url) && !url.includes(","));
  if (matched && singleDk) return { state, reason: reason || "VERIFIED", url, checkedAt: str(row.verified_at_et) };
  if (verified && !matched) return { state: "UNVERIFIED", reason: "Link withheld: the audit object does not match this original." };
  if (verified && !singleDk) return { state: "UNVERIFIED", reason: "DraftKings whole-ticket link withheld." };
  return { state, reason };
}

function rejected(message: string): HeistPrep {
  return {
    policyVersion: "",
    activationState: "",
    effectiveAt: null,
    decisionsReceivedAt: "",
    activeCappers: [],
    droppedCappers: [],
    conversionCappers: [],
    date: "",
    groups: [],
    pickCount: 0,
    verifiedHr: 0,
    verifiedDk: 0,
    linkState: "",
    pooledState: "",
    pooledRows: 0,
    personalActive: "",
    personalEntryCount: 0,
    countedPersonal: 0,
    personal: [],
    tree: [],
    playCount: 0,
    retireReady: false,
    blockers: [message],
    decisions: [],
    pointInTime: "",
  };
}

function forwardReason(entry: Row, effectiveAt: string | null, activation: string): { counted: boolean; reason: string } {
  if (activation !== "approved_activation" || !effectiveAt) {
    return { counted: false, reason: "Not counted. effective_at is empty until an approved release." };
  }
  const selected = str(entry.selected_at);
  if (!selected || selected < effectiveAt) {
    return { counted: false, reason: "Not counted. selected_at must be on or after effective_at, not the settled date." };
  }
  const counting = isRow(entry.counting) ? entry.counting : {};
  if (counting.enabled !== true || str(entry.migration_state) !== "new_personal") {
    return { counted: false, reason: "Not counted. Past Alt rows are not adopted." };
  }
  return { counted: true, reason: "Forward personal entry." };
}

/** Null when the live feed has none of the six cutover keys. */
export function readHeistContract(raw: unknown): HeistPrep | null {
  if (!isRow(raw)) return null;
  const present = SIX.filter((key) => key in raw);
  if (!present.length) return null;
  if (present.length !== SIX.length) return rejected("Staged overlay is missing one of the six production keys.");
  const meta = isRow(raw.heist_originals_meta) ? raw.heist_originals_meta : {};
  const policy = str(meta.policy_version);
  if (!policy.startsWith("heist-originals-")) return rejected("heist_originals_meta.policy_version is not the forward-only cutover.");
  const flags = isRow(meta.flags) ? meta.flags : {};
  const originals = isRow(raw.heist_originals) ? raw.heist_originals : {};
  const picks = isRow(originals.picks) ? originals.picks : {};
  const linksRoot = isRow(raw.heist_original_links) ? raw.heist_original_links : {};
  const links = isRow(linksRoot.items) ? linksRoot.items : {};
  const dropped = new Set((Array.isArray(meta.dropped_capper_ids) ? meta.dropped_capper_ids : []).map(str));
  const checkedAt = new Set<string>();
  const groups = (Array.isArray(originals.groups) ? originals.groups : []).flatMap((group) => {
    if (!isRow(group)) return [];
    const capperId = str(group.capper_id);
    const ids = Array.isArray(group.original_ids) ? group.original_ids.map(str).filter(Boolean) : [];
    const list = ids.flatMap((id) => {
      const pick = isRow(picks[id]) ? picks[id] : null;
      if (!pick) return [];
      const grade = isRow(pick.grade) ? pick.grade : {};
      const link = isRow(links[id]) ? links[id] : {};
      const books = isRow(pick.books) ? pick.books : {};
      const hr = actionable(books.hr, link, "hr");
      const dk = actionable(books.dk, link, "dk");
      if (hr.checkedAt) checkedAt.add(hr.checkedAt);
      if (dk.checkedAt) checkedAt.add(dk.checkedAt);
      const posted = str(pick.posted_odds_raw);
      const sourceIds = (Array.isArray(pick.source_post_ids) ? pick.source_post_ids : []).map(str).filter(Boolean).join(", ");
      return [{
        id,
        capperId: str(pick.capper_id) || capperId,
        rawPick: str(pick.raw_pick),
        posted: posted || (str(pick.posted_odds_reason) ? `Odds not posted: ${str(pick.posted_odds_reason)}` : "Odds not posted"),
        legacyCell: str(pick.raw_odds_cell),
        prop: str(pick.prop),
        sport: str(pick.sport),
        sourceIds,
        ticketId: str(pick.ticket_id),
        legCount: num(pick.leg_count) ?? 0,
        grade: str(grade.result),
        gradeDetail: str(grade.detail),
        gradeReason: str(grade.reason),
        hr,
        dk,
      }];
    });
    return [{ capperId, picks: list }];
  });
  const results = isRow(raw.results_cappers) ? raw.results_cappers : {};
  const byRecord = new Map<string, Row>();
  for (const row of Array.isArray(results.rows) ? results.rows : []) {
    if (isRow(row) && str(row.record_id)) byRecord.set(str(row.record_id), row);
  }
  const tree = (Array.isArray(results.capper_tree) ? results.capper_tree : []).flatMap((node) => {
    if (!isRow(node)) return [];
    const profile = isRow(node.legacy_profile) ? node.legacy_profile : {};
    const w = num(profile.w);
    const l = num(profile.l);
    const props = (Array.isArray(node.props) ? node.props : []).flatMap((prop) => {
      if (!isRow(prop)) return [];
      const days = (Array.isArray(prop.days) ? prop.days : []).flatMap((day) => {
        if (!isRow(day)) return [];
        const ids = Array.isArray(day.record_ids) ? day.record_ids.map(str).filter(Boolean) : [];
        const plays = ids.flatMap((recordId) => {
          const row = byRecord.get(recordId);
          if (!row) return [];
          const grade = isRow(row.grade) ? row.grade : {};
          const legacy = isRow(row.legacy_row) ? row.legacy_row : {};
          return [{
            recordId,
            originalId: str(row.original_id),
            pick: str(legacy.pick) || str(row.prop),
            grade: str(grade.result),
            detail: str(grade.detail),
            odds: str(legacy.odds),
          }];
        });
        return [{ date: str(day.date), count: ids.length, totals: totals(day.totals), plays }];
      });
      return [{ propId: str(prop.prop_id) || str(prop.prop), prop: str(prop.prop), totals: totals(prop.totals), counts: countOf(prop.totals), days }];
    });
    const capperId = str(node.capper_id);
    return [{
      capperId,
      dropped: dropped.has(capperId),
      profile: w == null && l == null ? "No legacy profile" : `${w ?? 0}-${l ?? 0}${num(profile.p) ? `-${num(profile.p)}` : ""}${num(profile.pct) == null ? "" : ` · ${num(profile.pct)}%`}`,
      profileW: w,
      profileL: l,
      profileP: num(profile.p),
      pct: num(profile.pct),
      rows: totals(node.totals),
      counts: countOf(node.totals),
      props,
    }];
  });
  const personalRoot = isRow(raw.personal_heist_alt) ? raw.personal_heist_alt : {};
  const entries = isRow(personalRoot.entries) ? personalRoot.entries : {};
  const effectiveAt = typeof meta.effective_at_et === "string" && meta.effective_at_et.trim() ? meta.effective_at_et.trim() : null;
  const activation = str(meta.activation_state);
  const personal = Object.values(entries).flatMap((entry) => {
    if (!isRow(entry)) return [];
    const grade = isRow(entry.grade) ? entry.grade : {};
    const status = forwardReason(entry, effectiveAt, activation);
    return [{
      id: str(entry.personal_id),
      pick: str(entry.pick),
      date: str(entry.date),
      grade: str(grade.result),
      counted: status.counted,
      reason: status.reason,
    }];
  });
  const pooled = isRow(raw.heist_pooled_originals) ? raw.heist_pooled_originals : {};
  const gates = Array.isArray(meta.retirement_gates) ? meta.retirement_gates.map(str).filter(Boolean) : [];
  const active = (Array.isArray(meta.active_capper_ids) ? meta.active_capper_ids : []).map(str).filter(Boolean);
  const conversion = (Array.isArray(meta.conversion_capper_ids_unchanged) ? meta.conversion_capper_ids_unchanged : []).map(str).filter(Boolean);
  const blockers = [
    activation === "approved_activation" ? "" : `Activation is ${activation || "missing"}.`,
    effectiveAt ? "" : "effective_at_et is null.",
    flags.retire_separate_cappers_tab === true ? "" : "retire_separate_cappers_tab is false.",
    meta.persistent_build_integrated === true ? "" : "Persistent build path is not marked integrated.",
    ...gates.map((gate) => `Open gate: ${gate}`),
  ].filter(Boolean);
  const retireReady =
    flags.retire_separate_cappers_tab === true &&
    activation === "approved_activation" &&
    Boolean(effectiveAt) &&
    meta.persistent_build_integrated === true &&
    meta.frontend_acceptance === true;
  const picksFlat = groups.flatMap((group) => group.picks);
  return {
    policyVersion: policy,
    activationState: activation,
    effectiveAt,
    decisionsReceivedAt: str(meta.decisions_received_at_et),
    activeCappers: active,
    droppedCappers: [...dropped],
    conversionCappers: conversion,
    date: str(originals.date),
    groups,
    pickCount: picksFlat.length,
    verifiedHr: picksFlat.filter((pick) => pick.hr.url).length,
    verifiedDk: picksFlat.filter((pick) => pick.dk.url).length,
    linkState: str(linksRoot.state),
    pooledState: str(pooled.state) || "unpopulated",
    pooledRows: Array.isArray(pooled.rows) ? pooled.rows.length : 0,
    personalActive: totals(personalRoot.active_totals),
    personalEntryCount: personal.length,
    countedPersonal: personal.filter((row) => row.counted).length,
    personal,
    tree,
    playCount: tree.reduce((sum, node) => sum + node.props.reduce((inner, prop) => inner + prop.days.reduce((days, day) => days + day.plays.length, 0), 0), 0),
    retireReady,
    blockers,
    decisions: [
      "After 4:45 PM ET, new originals are display only. Frozen Heist tickets are not edited.",
      "Personal Heist Alt ownership is forward-only. Zero historical adoption.",
      "Heist parlay tickets keep their own record beside the grouped originals.",
    ],
    pointInTime: [...checkedAt].sort().at(-1) ?? "",
  };
}
