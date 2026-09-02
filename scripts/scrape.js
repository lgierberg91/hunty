// Corre el scraper de Mercado Libre (vía el actor de Apify "MercadoLibre
// Scraper" de scrapers_lat) para detectar publicaciones nuevas de las
// búsquedas en lib/scrapedSearches.js, y manda una notificación push
// puntual si encuentra algo que no habíamos visto antes. Se ejecuta 3
// veces por día desde GitHub Actions (ver .github/workflows/scrape.yml).
//
// Importante: pedimos `withDetails: false` a propósito — el default del
// actor es `true`, que cobra bastante más caro (abre cada publicación para
// traer detalle). Como solo necesitamos título/precio/imagen/link para
// detectar novedades, nos quedamos con el listado simple.
//
// Los nombres exactos de los campos que devuelve el actor no están 100%
// documentados en público, así que itemId/itemTitle/etc. prueban varias
// alternativas conocidas. Si en algún momento deja de detectar bien algo,
// el log de la corrida en GitHub Actions imprime las claves del primer
// resultado — sirve para ajustar los nombres acá.

const webpush = require("web-push");
const { Redis } = require("@upstash/redis");
const { SCRAPED_SEARCHES } = require("../lib/scrapedSearches");

const {
  APIFY_API_TOKEN,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  SITE_URL,
} = process.env;

const APIFY_ACTOR = "scrapers_lat~mercadolibre-scraper";

function assertEnv() {
  const missing = [
    "APIFY_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
}

function itemId(raw) {
  return raw.url || raw.permalink || raw.productUrl || raw.link || raw.id || raw.itemId || null;
}

function itemTitle(raw) {
  return raw.title || raw.name || "Camiseta Huracán";
}

function itemPrice(raw) {
  const price = raw.price ?? raw.currentPrice;
  const currency = raw.currency || raw.currencyId || "ARS";
  return price != null ? `${currency} ${price}` : null;
}

function itemImage(raw) {
  return (
    raw.imageUrl ||
    raw.image ||
    raw.thumbnail ||
    (Array.isArray(raw.images) ? raw.images[0] : null) ||
    null
  );
}

function itemLink(raw) {
  return raw.url || raw.permalink || raw.productUrl || raw.link || null;
}

async function scrapeSearch(search) {
  const url = `https://api.apify.com/v2/actors/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchTerms: search.searchTerms,
      country: search.country,
      condition: search.condition,
      maxListings: search.maxListings,
      withDetails: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify respondió ${res.status} para "${search.label}": ${text.slice(0, 300)}`);
  }

  const items = await res.json();
  if (!Array.isArray(items)) {
    throw new Error(`Respuesta inesperada de Apify para "${search.label}" (no vino un array).`);
  }
  return items;
}

async function sendNewItemsPush(redis, siteUrl, summaries) {
  const payload = JSON.stringify({
    title: "ML Watch ⚽",
    body: `Hay publicaciones nuevas: ${summaries.join(", ")}.`,
    url: siteUrl,
  });

  const subscriptions = await redis.hgetall("mlwatch:push:subscriptions");
  const entries = Object.entries(subscriptions || {});
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
        await redis.hdel("mlwatch:push:subscriptions", endpoint);
        removed++;
      } else {
        console.error(`Error mandando push a ${endpoint.slice(0, 60)}...: ${status || ""} ${err.message}`);
      }
    }
  }

  console.log(`Push: ${sent} mandado(s), ${removed} suscripción(es) vencida(s) limpiada(s).`);
}

async function main() {
  assertEnv();

  const redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
  const siteUrl = SITE_URL || "https://hunty-blush.vercel.app";
  webpush.setVapidDetails("mailto:lgierberg91@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let anyNew = false;
  const newSummaries = [];

  for (const search of SCRAPED_SEARCHES) {
    let items;
    try {
      items = await scrapeSearch(search);
    } catch (err) {
      console.error(`Error scrapeando "${search.label}": ${err.message}`);
      continue;
    }

    console.log(`"${search.label}": ${items.length} resultado(s) de Apify.`);
    if (items[0]) {
      console.log("Campos del primer resultado (debug):", Object.keys(items[0]));
    }

    const seenKey = `mlwatch:scrape:seen:${search.key}`;
    const catalogKey = `mlwatch:scrape:catalog:${search.key}`;

    const normalized = items
      .map((raw) => {
        const id = itemId(raw);
        if (!id) return null;
        return {
          id,
          title: itemTitle(raw),
          price: itemPrice(raw),
          image: itemImage(raw),
          link: itemLink(raw) || id,
        };
      })
      .filter(Boolean);

    const newItems = [];
    for (const item of normalized) {
      const wasSeen = await redis.sismember(seenKey, item.id);
      if (!wasSeen) {
        newItems.push(item);
        await redis.sadd(seenKey, item.id);
      }
    }

    if (newItems.length > 0) {
      anyNew = true;
      newSummaries.push(`${newItems.length} en "${search.label}"`);
    }

    // Guardamos el catálogo completo de esta corrida (lo que muestra la
    // webapp), marcando cuáles son las nuevas de esta pasada.
    const now = Date.now();
    const catalog = normalized.map((item) => ({
      ...item,
      isNew: newItems.some((n) => n.id === item.id),
      seenAt: now,
    }));
    await redis.set(catalogKey, JSON.stringify(catalog));
  }

  if (anyNew) {
    await sendNewItemsPush(redis, siteUrl, newSummaries);
  } else {
    console.log("Sin novedades esta corrida.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
