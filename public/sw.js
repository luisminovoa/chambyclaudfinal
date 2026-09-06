/* Service worker de Chamby: offline básico.
   Estrategia network-first: nunca sirve contenido viejo si hay red;
   solo cachea la página offline y los iconos de la app. */
const CACHE = "chamby-offline-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    })
  );
});

/* FASE P1-B1 (Web Push) — infraestructura de recepción únicamente. Nadie
   envía un push todavía (eso llega en una fase posterior, vía Edge
   Function); este handler ya queda listo para cuando eso ocurra. El
   payload esperado es el mínimo definido en el diseño P1-A: {title,
   body, jobId} — nunca datos sensibles ni el contenido completo de una
   fila de `notifications`. Si `event.data` no trae JSON válido (o no
   trae nada), se degrada a un texto genérico en vez de fallar. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "Chamby";
  const body =
    typeof payload.body === "string" && payload.body ? payload.body : "Tienes una notificación nueva.";
  const jobId = typeof payload.jobId === "string" ? payload.jobId : null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { jobId },
    })
  );
});

/* Click en la notificación del sistema: enfoca una pestaña de Chamby ya
   abierta si existe (nunca abre una segunda innecesariamente) o abre una
   nueva apuntando al job del recordatorio; sin jobId, abre la raíz. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const jobId = event.notification.data && event.notification.data.jobId;
  const targetPath = jobId ? `/jobs/${jobId}` : "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetUrl = new URL(targetPath, self.location.origin).href;

      const existing = allClients.find((client) => client.url === targetUrl);
      if (existing) {
        await existing.focus();
        return;
      }

      const anyChambyClient = allClients[0];
      if (anyChambyClient) {
        await anyChambyClient.focus();
        anyChambyClient.navigate(targetUrl);
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
