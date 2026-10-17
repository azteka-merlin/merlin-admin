self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const path = typeof payload.url === "string" && /^\/alerts(?:\?|$)/.test(payload.url)
    ? payload.url : "/alerts";
  event.waitUntil(self.registration.showNotification(payload.title || "Merlin Admin", {
    body: payload.body || "Novo alerta operacional.",
    icon: "/votacao/merlin-mark.png",
    badge: "/votacao/merlin-mark.png",
    tag: payload.tag || "merlin-admin-alert",
    data: { path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path || "/alerts";
  event.waitUntil(self.clients.openWindow(new URL(path, self.location.origin).toString()));
});
