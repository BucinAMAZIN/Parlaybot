/** The build number printed in `<meta name="parlaybot-build" content="27">`. */
export function buildNumber(html: string): string {
  const named = html.match(/<meta[^>]*name="parlaybot-build"[^>]*content="(\d+)"/i);
  if (named) return named[1];
  const flipped = html.match(/<meta[^>]*content="(\d+)"[^>]*name="parlaybot-build"/i);
  return flipped?.[1] ?? "";
}

/** True when Pages is serving a higher build than the one running in this tab. */
export function newerBuild(current: string, remote: string): boolean {
  if (!/^\d+$/.test(current) || !/^\d+$/.test(remote)) return false;
  return Number(remote) > Number(current);
}
