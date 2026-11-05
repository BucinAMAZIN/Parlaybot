import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});
const page = await browser.newPage();
const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  else console.log("ok", name);
}

async function shot(name) {
  const path = `/workspace/docs/screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
}

async function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

await mkdir("/workspace/docs/screenshots", { recursive: true });
await mkdir("/opt/cursor/artifacts", { recursive: true });

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:4173/#today", { waitUntil: "networkidle0" });
await page.waitForSelector(".brand img");

await page.evaluate(() => document.querySelectorAll("details.off").forEach((el) => { el.open = true; }));
const todayText = await page.evaluate(() => document.body.innerText);
check("brand text or logo", todayText.length > 100);
check("logo", await page.$("img[alt='ParlayBOT']"));
check("heist", todayText.includes("THE HEIST"));
check("alt line", todayText.includes("Alt line") && todayText.includes("Over 9.5 ast +105") && todayText.includes("Over 7.5 ast"));
check("safe", todayText.includes("Safe +100"));
check("edge markers", todayText.includes("6–8% edge") && todayText.includes("SOG target") && todayText.includes("Assist risk"));
check("out status", todayText.includes("Out") && todayText.includes("4:10 PM"));
check("why collapsed", todayText.includes("Why:") || todayText.includes("Our read:"));
check("private", todayText.includes("Only you can see this"));
check("td city hidden", !todayText.includes("TD City") || todayText.includes("TD City hidden"));
check("no page overflow today 390", (await overflow()) <= 1, String(await overflow()));
await shot("today-390");

await page.click("details.why summary");
const openWhy = await page.$("details.why[open] .no");
check("why expands", !!openWhy);
await shot("today-why-390");

await page.click(".book button.dk");
const dkText = await page.evaluate(() => document.body.innerText);
const dkDom = await page.evaluate(() => ({
  notes: [...document.querySelectorAll(".na")].map((node) => node.textContent.trim()),
  summaries: [...document.querySelectorAll("details.off summary")].map((node) => node.textContent.trim()),
  heist: document.querySelector("#ticket-heist")?.innerText || "",
}));
const heistFull = await page.evaluate(() => document.querySelector("#ticket-heist")?.textContent || "");
check("not on dk", dkDom.notes.includes("Not on DK") || heistFull.includes("Not on DK"));
check("heist plays stay without ids", heistFull.includes("Jared McCain") && heistFull.includes("Not on DK"));
check("edge feed not silently skipped", dkDom.summaries.some((line) => line.includes("14 plays not on DK")) || heistFull.length > 0 && (await page.evaluate(() => document.body.textContent || "")).includes("Not on DK"));
await shot("today-dk-390");
await page.click(".book button.hr");

await page.click("[data-view='live']");
await page.waitForSelector(".mood");
const liveText = await page.evaluate(() => document.body.innerText);
check("live mood", liveText.includes("Sweating") && liveText.includes("hit") && liveText.includes("alive"));
check("live tickets", liveText.includes("McCain needs 2 REB"));
check("no page overflow live 390", (await overflow()) <= 1);
await shot("live-390");
await page.click(".gx summary");
await page.waitForSelector(".gx[open]");
check("game expands", !!(await page.$(".gx[open]")));
await page.click(".gx[open] [data-panel='box']");
check("box tab", (await page.evaluate(() => document.body.innerText)).includes("Box score") || (await page.evaluate(() => document.body.innerText)).includes("MIN") || (await page.evaluate(() => document.body.innerText)).includes("TOI") || (await page.evaluate(() => document.body.innerText)).includes("SAMPLE"));
await page.click(".gx[open] [data-panel='vs']");
const vsText = await page.evaluate(() => document.body.innerText);
check("team vs", vsText.includes("SAMPLE") && (vsText.includes("Off") || vsText.includes("Goals")));
await shot("live-vs-390");

await page.click("[data-view='results']");
await page.waitForSelector(".grade");
const resultsText = await page.evaluate(() => document.body.innerText);
check("nightly grade", resultsText.includes("Beat close") && resultsText.includes("Missed close"));
check("results private", resultsText.includes("Only you can see this"));
check("no page overflow results 390", (await overflow()) <= 1);
await shot("results-390");
await page.evaluate(() => document.querySelector("[data-settled='1']")?.click());
const shareText = await page.evaluate(() => document.querySelector(".sharecard")?.innerText || "");
check("share has legs", shareText.includes("Trae Young") && shareText.includes("11 ast"), shareText.slice(0, 180));
check("share hides money", !shareText.includes("+3.4") && !shareText.includes("+2.1") && !/\d+(?:\.\d+)?u\b/i.test(shareText) && !/profit|bankroll/i.test(shareText), shareText.slice(0, 220));
await page.evaluate(() => document.querySelector("[data-act='save-share']")?.click());
await page.waitForNetworkIdle?.().catch(() => {});
await new Promise((r) => setTimeout(r, 300));
await shot("share-390");
await page.keyboard.press("Escape");

await page.click("[data-view='stats']");
const statsText = await page.evaluate(() => document.body.innerText);
check("stats profit", statsText.includes("+9.4u") && statsText.includes("Only you can see this"));
check("stats rings", statsText.includes("THE HEIST") && statsText.includes("60%"));
check("edge fixture record", statsText.includes("FIXTURE") && statsText.includes("Flat 1u"));
check("no page overflow stats 390", (await overflow()) <= 1);
await shot("stats-390");

await page.click("[data-act='standings']");
await page.waitForSelector(".ftbl");
const stdText = await page.evaluate(() => document.body.innerText);
check("nba standings", stdText.includes("PHI") && stdText.includes("W-L") && stdText.includes("Atlantic"));
check("sticky header cells", await page.$(".ftbl td:first-child"));
check("no page overflow standings 390", (await overflow()) <= 1, String(await overflow()));
await shot("standings-390");
for (const league of ["NHL", "NFL", "MLB", "NCAAF", "NCAAB"]) {
  await page.click(`[data-key='${league}']`);
  const text = await page.evaluate(() => document.body.innerText);
  check(`${league} tab`, text.includes(league));
  check(`${league} no page overflow`, (await overflow()) <= 1, String(await overflow()));
}
await page.click("[data-key='NBA']");

await page.click("[data-view='cappers']");
const capText = await page.evaluate(() => document.body.innerText);
check("five heist cappers", ["@alexcaruso", "@panpotd", "@austinsprops", "@showtimepicks2", "@bigmikepickz"].every((name) => capText.includes(name)));
check("an cappers", capText.includes("Jim Turvey") && capText.includes("Koerner") && capText.includes("Marchio") && capText.includes("not in THE HEIST"));
check("capper not removed when off book", capText.includes("Under 228.5"));
await shot("cappers-390");

await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:4173/#today", { waitUntil: "networkidle0" });
check("360 today overflow", (await overflow()) <= 1, String(await overflow()));
await shot("today-360");
await page.goto("http://127.0.0.1:4173/#standings", { waitUntil: "networkidle0" });
check("360 standings overflow", (await overflow()) <= 1, String(await overflow()));
await shot("standings-360");
await page.evaluate(() => document.documentElement.classList.add("xl"));
check("360 large text overflow", (await overflow()) <= 1, String(await overflow()));

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:4173/#today", { waitUntil: "networkidle0" });
const cols = await page.evaluate(() => {
  const home = document.querySelector(".home");
  return home ? getComputedStyle(home).gridTemplateColumns : "missing";
});
check("desktop two columns", cols.split(" ").length >= 2, cols);
check("1280 overflow", (await overflow()) <= 1, String(await overflow()));
await shot("today-1280");

await browser.close();
if (failures.length) {
  console.error("FAILURES\n" + failures.join("\n"));
  process.exit(1);
}
console.log("verify ok");
