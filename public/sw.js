/* Only public assets are cached. Never persist HTML sessions, RSC, APIs or mutations. */
const VERSION = "delta-public-v3";
const PUBLIC = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PUBLIC)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("delta-public-") && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    req.headers.get("RSC")
  )
    return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Next development script/style URLs can retain their names after edits.
  // Let HTTP caching handle executable assets; never replay them from CacheStorage.
  if (
    PUBLIC.includes(url.pathname) ||
    /^\/_next\/static\/.*\.woff2$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(
                caches.open(VERSION).then((cache) => cache.put(req, copy)),
              );
            }
            return response;
          }),
      ),
    );
  }
});

// Always generic: no announcement, ticket, financial or identity data on a lock screen.
self.addEventListener("push", (event) => {
  let tag = "delta-message";
  try {
    const value = event.data?.json();
    if (/^delta-[a-z0-9-]{36}$/.test(value?.tag)) tag = value.tag;
  } catch {}
  event.waitUntil(
    self.registration.showNotification("ساختمان دلتا", {
      body: "پیام جدیدی در سامانه دارید. برای مشاهده وارد شوید.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      data: { url: "/notifications" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const url = new URL("/notifications", self.location.origin).href;
        for (const client of windows) {
          if (new URL(client.url).origin === self.location.origin) {
            await client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
