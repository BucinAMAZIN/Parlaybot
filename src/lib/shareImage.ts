import type { ShareCard } from "./shareCard.ts";

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Ticket image only. The card model is already stripped of profit and units. */
export function drawShareCard(card: ShareCard): HTMLCanvasElement {
  const width = 720;
  const pad = 36;
  const canvas = document.createElement("canvas");
  const measure = document.createElement("canvas").getContext("2d");
  const ctx = canvas.getContext("2d");
  if (!ctx || !measure) throw new Error("canvas unavailable");
  measure.font = "600 28px sans-serif";
  const legHeights = card.legs.map((leg) => {
    const lines = wrap(measure, `${leg.mark}  ${leg.name}`, width - pad * 2 - 140);
    return Math.max(44, lines.length * 32);
  });
  const height = 210 + legHeights.reduce((sum, n) => sum + n, 0);
  canvas.width = width;
  canvas.height = height;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1b3a2a");
  gradient.addColorStop(0.7, "#0d1117");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#76f53a";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.fillStyle = "#eef2f6";
  ctx.font = "800 28px sans-serif";
  ctx.fillText(card.title.toUpperCase(), pad, 64);
  const badge = card.result;
  ctx.font = "800 22px sans-serif";
  const badgeWidth = ctx.measureText(badge).width + 28;
  ctx.fillStyle = card.result === "LOST" ? "#ff6b6b" : "#76f53a";
  roundRect(ctx, width - pad - badgeWidth, 36, badgeWidth, 40, 8);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillText(badge, width - pad - badgeWidth + 14, 64);

  ctx.fillStyle = "#eef2f6";
  ctx.font = "800 54px sans-serif";
  const odds = card.odds ?? `${card.legs.length} legs`;
  ctx.fillText(odds, pad, 130);
  const oddsWidth = ctx.measureText(odds).width;
  ctx.font = "600 24px sans-serif";
  ctx.fillStyle = "#a9b4c2";
  ctx.fillText(`  ·  ${card.legs.length} legs`, pad + oddsWidth + 8, 130);

  let y = 168;
  card.legs.forEach((leg, index) => {
    ctx.strokeStyle = "#2a3b33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
    ctx.font = "600 28px sans-serif";
    ctx.fillStyle = "#eef2f6";
    const nameLines = wrap(ctx, `${leg.mark}  ${leg.name}`, width - pad * 2 - 150);
    nameLines.forEach((line, lineIndex) => ctx.fillText(line, pad, y + 36 + lineIndex * 32));
    ctx.font = "800 26px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(leg.detail, width - pad, y + 36);
    ctx.textAlign = "left";
    y += legHeights[index] ?? 44;
  });

  ctx.fillStyle = "#a9b4c2";
  ctx.font = "600 22px sans-serif";
  ctx.fillText(card.foot, pad, height - 36);
  ctx.fillStyle = "#76f53a";
  ctx.font = "800 18px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("ParlayBOT", width - pad, height - 36);
  ctx.textAlign = "left";
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png failed"))), "image/png");
  });
}
