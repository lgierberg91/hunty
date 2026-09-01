// Service worker de ML Watch — solo existe para recibir notificaciones push
// (el recordatorio de 2 veces por día). No cachea nada de la webapp: cada
// vez que se abre ML Watch se pide todo de nuevo, así que si este archivo
// cambia el navegador lo reemplaza solo, sin lío de caché vieja.

self.addEventListener("push", (event) => {
  let data = { title: "ML Watch", body: "Es hora de revisar las camisetas usadas.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // si por algo el payload no es JSON, nos quedamos con el default de arriba
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url },
      tag: "mlwatch-reminder", // pisa la notificación anterior en vez de acumular
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })()
  );
});
