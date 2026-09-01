// Manda el recordatorio push de ML Watch a todos los navegadores
// suscriptos. Lo corre GitHub Actions 2 veces por día (ver
// .github/workflows/remind.yml) — no toca Mercado Libre para nada, solo le
// pega a nuestro propio Redis y al servicio de push del navegador (Google
// para Chrome), así que no hay ningún riesgo de detección acá.

const webpush = require("web-push");
const { Redis } = require("@upstash/redis");

const {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  SITE_URL,
} = process.env;

function assertEnv() {
  const missing = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]
    .filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
}

async function main() {
  assertEnv();

  const redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
  const siteUrl = SITE_URL || "https://hunty-blush.vercel.app";

  webpush.setVapidDetails(`mailto:lgierberg91@gmail.com`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subscriptions = await redis.hgetall("mlwatch:push:subscriptions");
  const entries = Object.entries(subscriptions || {});

  if (entries.length === 0) {
    console.log("No hay ningún navegador suscripto todavía. No se manda nada.");
    return;
  }

  const payload = JSON.stringify({
    title: "ML Watch ⚽",
    body: "Es hora de revisar las camisetas usadas en Mercado Libre.",
    url: siteUrl,
  });

  let sent = 0;
  let removed = 0;

  for (const [endpoint, raw] of entries) {
    const subscription = typeof raw === "string" ? JSON.parse(raw) : raw;
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      const status = err.statusCode;
      if (status === 404 || status === 410) {
        // El navegador canceló la suscripción o ya no existe — la borramos
        // para no seguir intentando en vano.
        await redis.hdel("mlwatch:push:subscriptions", endpoint);
        removed++;
      } else {
        console.error(`Error mandando push a ${endpoint.slice(0, 60)}...: ${status || ""} ${err.message}`);
      }
    }
  }

  console.log(`Listo. ${sent} notificación(es) mandada(s), ${removed} suscripción(es) vencida(s) limpiada(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
