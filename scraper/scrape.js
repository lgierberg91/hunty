// Scrapea los resultados de búsqueda de Mercado Libre (solo condición "Usado")
// para cada palabra clave de keywords.json, y arma un "feed" acumulado en
// Redis (Upstash): cada publicación que aparece por primera vez se guarda
// con la fecha en que la vimos, y ese feed se mantiene con una ventana de
// 48hs para que la webapp pueda mostrar "lo nuevo de las últimas X horas"
// sin depender de que Mercado Libre tenga una fecha de publicación pública.
//
// Para bajar la página usamos Firecrawl (https://firecrawl.dev) en vez de
// correr un navegador nosotros mismos: Mercado Libre detecta y devuelve
// resultados vacíos a navegadores automatizados "caseros" (confirmado en
// vivo, ver README), y Firecrawl es un servicio pensado justamente para
// esquivar ese tipo de bloqueo. Como su extracción con IA (formato "json")
// cuesta 5 créditos por página, acá pedimos el HTML ya renderizado (1
// crédito por página) y lo parseamos nosotros mismos con cheerio, igual que
// antes hacíamos con Playwright.
//
// Pensado para correr desde GitHub Actions un par de veces por día (no cada
// hora) para entrar cómodos en el plan gratis de Firecrawl (1000 créditos/mes).

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { Redis } = require("@upstash/redis");

const KEYWORDS_FILE = path.join(__dirname, "keywords.json");
const MAX_ITEMS_PER_KEYWORD = 50;
const FEED_WINDOW_MS = 48 * 60 * 60 * 1000; // 48hs
const DELAY_BETWEEN_KEYWORDS_MS = 1500;
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_TIMEOUT_MS = 45000;

// ID de atributo de condición "Usado" en Mercado Libre (MLA). Es el mismo
// filtro que se aplica al tildar "Usado" en la barra lateral de la web.
// A diferencia de la versión anterior, acá NO hay fallback a "sin filtrar"
// si esto falla: Leo pidió explícitamente nunca mostrar condición "nuevo",
// así que si el filtro no trae nada preferimos no traer nada a traer de más.
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

// Le pide a Firecrawl el HTML ya renderizado de una URL (1 crédito/página).
//
// onlyMainContent:false — la primera versión lo tenía en true y todas las
// palabras clave volvieron con 0 resultados; es posible que el "detector de
// contenido principal" de Firecrawl esté descartando la grilla de productos
// en esta página en particular, así que pedimos el HTML completo y filtramos
// nosotros mismos con cheerio.
// actions wait — la página de Mercado Libre carga ~90 archivos JS antes de
// pintar los resultados; le pedimos a Firecrawl que espere un poco extra
// después de cargar, por si el timing por defecto no alcanza para esta SPA
// en particular.
async function firecrawlGetHtml(url, apiKey) {
  const res = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: [{ type: "html" }],
      onlyMainContent: false,
      actions: [{ type: "wait", milliseconds: 4000 }],
      timeout: FIRECRAWL_TIMEOUT_MS,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(`Firecrawl success:false — ${JSON.stringify(json).slice(0, 300)}`);
  }

  const html = json.data && json.data.html ? json.data.html : "";
  const statusCode = json.data && json.data.metadata ? json.data.metadata.statusCode : "?";

  // Log de diagnóstico temporal: nos dice si Firecrawl trajo una página con
  // contenido real (aunque .poly-card no matchee) o si vino vacía/bloqueada.
  console.log(
    `    [debug] statusCode=${statusCode} htmlLen=${html.length} tienePolyCard=${html.includes("poly-card")} tieneResultados=${html.includes("esultado")}`
  );

  return html;
}

function extractCards(html) {
  const $ = cheerio.load(html);
  const items = [];

  $(".poly-card").each((_, el) => {
    const titleEl = $(el).find(".poly-component__title").first();
    if (titleEl.length === 0) return;

    const href = titleEl.attr("href") || "";
    // Solo nos interesan resultados orgánicos (link directo a articulo.mercadolibre.com.ar).
    // Los "Promocionados" van por click1.mercadolibre.com.ar y los descartamos.
    const idMatch = href.match(/MLA-?(\d{5,})/i);
    if (!href.includes("articulo.mercadolibre.com.ar") || !idMatch) return;

    const priceText = $(el).find(".poly-price__current .poly-price__amount").first().text() || "";
    const price = parseInt(priceText.replace(/[^\d]/g, ""), 10) || null;

    const imgEl = $(el).find(".poly-component__picture").first();
    const thumbnail = imgEl.attr("data-src") || imgEl.attr("src") || null;

    items.push({
      id: "MLA" + idMatch[1],
      title: titleEl.text().trim(),
      price,
      currency: "ARS",
      permalink: href.split("#")[0],
      thumbnail,
    });
  });

  return items;
}

async function scrapeKeyword(keyword, firecrawlKey) {
  const slug = slugify(keyword);
  const usedUrl = `https://listado.mercadolibre.com.ar/${slug}${USED_CONDITION_SUFFIX}`;
  const html = await firecrawlGetHtml(usedUrl, firecrawlKey);
  return extractCards(html);
}

async function main() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!upstashUrl || !upstashToken) {
    throw new Error("Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN en el entorno.");
  }
  if (!firecrawlKey) {
    throw new Error("Falta FIRECRAWL_API_KEY en el entorno.");
  }
  const redis = new Redis({ url: upstashUrl, token: upstashToken });

  const keywords = JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf-8"));
  console.log(`Scrapeando ${keywords.length} palabras clave vía Firecrawl...`);

  const errors = {};
  const emptyResults = [];
  const now = Date.now();

  for (const keyword of keywords) {
    try {
      console.log(`- "${keyword}"...`);
      const items = await scrapeKeyword(keyword, firecrawlKey);
      if (items.length === 0) emptyResults.push(keyword);

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

  await redis.set("mlwatch:keywords", keywords);
  await redis.set("mlwatch:lastScraped", new Date(now).toISOString());
  await redis.set("mlwatch:lastErrors", errors);
  if (emptyResults.length > 0) {
    console.warn(
      `Aviso: 0 resultados para: ${emptyResults.join(", ")} (puede ser normal, o el filtro/bloqueo de Mercado Libre — revisar si se repite seguido).`
    );
  }

  const failedCount = Object.keys(errors).length;
  console.log(`Listo. ${keywords.length - failedCount}/${keywords.length} palabras clave OK.`);

  if (failedCount === keywords.length) {
    // Si TODAS fallaron, probablemente Mercado Libre cambió algo, Firecrawl
    // tuvo un problema, o se acabaron los créditos - marcamos el job como
    // fallido para que se note en GitHub Actions.
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
