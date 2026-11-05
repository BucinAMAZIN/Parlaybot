/* ParlayBOT push worker. Payloads are short titles only. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title.slice(0, 80) : "ParlayBOT";
  const body = typeof data.body === "string" ? data.body.slice(0, 160) : "";
  const hash = typeof data.url === "string" && /^#[a-z]+$/.test(data.url) ? data.url : "#today";
  const tag = typeof data.tag === "string" ? data.tag.slice(0, 64) : "parlaybot";
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
  const hash = event.notification.data && event.notification.data.hash ? event.notification.data.hash : "#today";
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
