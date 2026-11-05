import "./styles.css";
import { start } from "./app.ts";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  }).catch(() => undefined);
}

const moods = ["ice", "sweat", "fire", "cash", "hook"] as const;
const base = import.meta.env.BASE_URL || "/";
for (const mood of moods) {
  for (let frame = 0; frame < 4; frame++) {
    document.documentElement.style.setProperty(`--m-${mood}-${frame}`, `url("${base}mascot/e-${mood}-${frame}.png")`);
  }
}

start();
