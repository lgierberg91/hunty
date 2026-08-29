// Scrapea los resultados de búsqueda de Mercado Libre (solo condición "Usado")
// para cada palabra clave de keywords.json, y arma un "feed" acumulado en
// Redis (Upstash): cada publicación que aparece por primera vez se guarda
// con la fecha en que la vimos, y ese feed se mantiene con una ventana de
// 48hs para que la webapp pueda mostrar "lo nuevo de las últimas X horas"
// sin depender de que Mercado Libre tenga una fecha de publicación pública.
//
// Pensado para correr desde GitHub Actions (o cualquier máquina con Node),
// no desde Vercel: necesita un navegador real (Playwright), no una función
// serverless liviana.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { Redis } = require("@upstash/redis");

const KEYWORDS_FILE = path.join(__dirname, "keywords.json");
const MAX_ITEMS_PER_KEYWORD = 50;
const FEED_WINDOW_MS = 48 * 60 * 60 * 1000; // 48hs
const NAV_TIMEOUT_MS = 30000;
const RESULTS_TIMEOUT_MS = 20000;
const DELAY_BETWEEN_KEYWORDS_MS = 1500;

// ID de atributo de condición "Usado" en Mercado Libre (MLA). Es el mismo
// filtro que se aplica al tildar "Usado" en la barra lateral de la web.
const USED_CONDITION_SUFFIX = "_ITEM%2ACONDITION_2230581";

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractCards(page) {
  return page.$$eval(".poly-card", (cards) =>
    cards
      .map((card) => {
        const titleEl = card.querySelector(".poly-component__title");
        if (!titleEl) return null;

        const href = titleEl.href || "";
        // Solo nos interesan resultados orgánicos (link directo a articulo.mercadolibre.com.ar).
        // Los "Promocionados" van por click1.mercadolibre.com.ar y los descartamos.
        const idMatch = href.match(/MLA-?(\d{5,})/i);
        if (!href.includes("articulo.mercadolibre.com.ar") || !idMatch) return null;

        const priceEl = card.querySelector(".poly-price__current .poly-price__amount");
        const priceText = priceEl ? priceEl.textContent || "" : "";
        const price = parseInt(priceText.replace(/[^\d]/g, ""), 10) || null;

        const imgEl = card.querySelector(".poly-component__picture");
        const thumbnail = imgEl
          ? imgEl.getAttribute("data-src") || imgEl.getAttribute("src") || null
          : null;

        return {
          id: "MLA" + idMatch[1],
          title: (titleEl.textContent || "").trim(),
          price,
          currency: "ARS",
          permalink: href.split("#")[0],
          thumbnail,
        };
      })
      .filter(Boolean)
  );
}

async function scrapeKeyword(browser, keyword) {
  const slug = slugify(keyword);
  const context = await browser.newContext({
    locale: "es-AR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Intento 1: filtrado a condición "Usado".
    const usedUrl = `https://listado.mercadolibre.com.ar/${slug}${USED_CONDITION_SUFFIX}`;
    await page.goto(usedUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    try {
      await page.waitForSelector(".poly-card", { timeout: RESULTS_TIMEOUT_MS });
      const items = await extractCards(page);
      if (items.length > 0) return { items, usedFilterApplied: true };
    } catch (e) {
      // sigue al fallback
    }

    // Fallback: si el filtro de condición no trajo nada (puede que Mercado
    // Libre haya cambiado el ID del filtro), reintentamos sin filtrar por
    // condición para no perder la palabra clave entera.
    const plainUrl = `https://listado.mercadolibre.com.ar/${slug}`;
    await page.goto(plainUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector(".poly-card", { timeout: RESULTS_TIMEOUT_MS });
    const items = await extractCards(page);
    return { items, usedFilterApplied: false };
  } finally {
    await context.close();
  }
}

async function main() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) {
    throw new Error("Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN en el entorno.");
  }
  const redis = new Redis({ url: upstashUrl, token: upstashToken });

  const keywords = JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf-8"));
  console.log(`Scrapeando ${keywords.length} palabras clave...`);

  const browser = await chromium.launch({ headless: true });
  const errors = {};
  const filterWarnings = [];
  const now = Date.now();

  try {
    for (const keyword of keywords) {
      try {
        console.log(`- "${keyword}"...`);
        const { items, usedFilterApplied } = await scrapeKeyword(browser, keyword);
        if (!usedFilterApplied) filterWarnings.push(keyword);

        const feedKey = `mlwatch:feed:${keyword}`;
        const dataKey = `mlwatch:itemdata:${keyword}`;
        let newCount = 0;

        for (const item of items.slice(0, MAX_ITEMS_PER_KEYWORD)) {
          // Guarda/actualiza los datos del item (precio, título, etc. pueden cambiar).
          await redis.hset(dataKey, { [item.id]: JSON.stringify(item) });

          // Solo lo agrega al feed cronológico si es la primera vez que lo vemos,
          // así la fecha del feed refleja cuándo "apareció" para nosotros.
          const already = await redis.zscore(feedKey, item.id);
          if (already === null || already === undefined) {
            await redis.zadd(feedKey, { score: now, member: item.id });
            newCount++;
          }
        }

        // Poda entradas del feed más viejas que la ventana de 48hs.
        await redis.zremrangebyscore(feedKey, 0, now - FEED_WINDOW_MS);

        console.log(`  ${items.length} vistos, ${newCount} nuevos en el feed.`);
      } catch (err) {
        console.error(`  Error con "${keyword}": ${err.message}`);
        errors[keyword] = String(err.message || err);
      }
      await sleep(DELAY_BETWEEN_KEYWORDS_MS);
    }
  } finally {
    await browser.close();
  }

  await redis.set("mlwatch:keywords", keywords);
  await redis.set("mlwatch:lastScraped", new Date(now).toISOString());
  await redis.set("mlwatch:lastErrors", errors);
  if (filterWarnings.length > 0) {
    console.warn(
      `Aviso: el filtro de "Usado" no funcionó para: ${filterWarnings.join(", ")} (se guardaron sin filtrar por condición).`
    );
  }

  const failedCount = Object.keys(errors).length;
  console.log(`Listo. ${keywords.length - failedCount}/${keywords.length} palabras clave OK.`);

  if (failedCount === keywords.length) {
    // Si TODAS fallaron, probablemente Mercado Libre cambió algo o nos bloqueó -
    // marcamos el job como fallido para que se note en GitHub Actions.
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
