/* ParlayBOT push worker. Every push shows a notification. Taps stay inside this app. */
function alertRoute(tag) {
  const text = typeof tag === "string" ? tag : "";
  if (/^(rz|td)/i.test(text)) return "#live";
  if (/^(final|ticket|spr|ut)/i.test(text)) return "#results";
  return "#today";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const rawTitle = typeof data.title === "string" && data.title.trim() ? data.title : "ParlayBOT";
  const title = rawTitle.replace(/Parlay Desk/g, "ParlayBOT").slice(0, 80);
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "";
  const tag = typeof data.tag === "string" ? data.tag.slice(0, 64) : "parlaybot";
  const hash = alertRoute(tag);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: new URL("brand/parlaybot-icon-192.png", self.registration.scope).href,
      data: { hash },
      tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tag = event.notification.tag || "";
  const stored = event.notification.data && event.notification.data.hash;
  const hash = /^(rz|td|final|ticket|spr|ut)/i.test(tag) ? alertRoute(tag) : typeof stored === "string" && /^#[a-z]+$/.test(stored) ? stored : alertRoute(tag);
  const dest = new URL(hash, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          if ("navigate" in client) client.navigate(dest);
          return client.focus();
        }
      }
      return self.clients.openWindow(dest);
    }),
  );
});
