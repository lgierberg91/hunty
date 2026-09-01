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
//
// Variación aleatoria: para no tener siempre exactamente el mismo patrón
// (mismo orden de palabras clave, mismas pausas, mismo tiempo de espera),
// el orden de scrapeo, las pausas entre palabras clave y el tiempo de
// espera de renderizado varían un poco en cada corrida. Ojo: según lo que
// vimos en una corrida de diagnóstico (commit ea1414c), el bloqueo actual
// no parece ser por patrón de comportamiento dentro de una corrida —
// aparece ya en la primera palabra clave, con Firecrawl devolviendo la
// pantalla de login de Mercado Libre en vez de resultados — sino por no
// tener una sesión logueada. Esta variación es buena práctica igual, pero
// probablemente no alcance sola para destrabar esto (ver README).

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { Redis } = require("@upstash/redis");

const KEYWORDS_FILE = path.join(__dirname, "keywords.json");
const MAX_ITEMS_PER_KEYWORD = 50;
const FEED_WINDOW_MS = 48 * 60 * 60 * 1000; // 48hs
const DELAY_BETWEEN_KEYWORDS_MIN_MS = 1500;
const DELAY_BETWEEN_KEYWORDS_MAX_MS = 5000;
const FIRECRAWL_WAIT_MIN_MS = 3000;
const FIRECRAWL_WAIT_MAX_MS = 6000;
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

// Entero aleatorio entre min y max (ambos inclusive).
function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Devuelve una copia del array con el orden mezclado (Fisher-Yates), sin
// tocar el original — así el orden de scrapeo varía pero el orden que
// mostramos en la webapp (mlwatch:keywords) se mantiene estable.
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
// después de cargar (con un tiempo aleatorio, no siempre el mismo), por si
// el timing por defecto no alcanza para esta SPA en particular.
async function firecrawlGetHtml(url, apiKey) {
  const waitMs = randomInt(FIRECRAWL_WAIT_MIN_MS, FIRECRAWL_WAIT_MAX_MS);
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
      actions: [{ type: "wait", milliseconds: waitMs }],
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
  const meta = (json.data && json.data.metadata) || {};
  const bodyTextGuess = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  // Log de diagnóstico temporal: nos dice si Firecrawl trajo una página con
  // contenido real (aunque .poly-card no matchee) o si vino vacía/bloqueada,
  // y qué texto hay realmente en esa página (un mensaje de bloqueo/captcha
  // se va a notar acá aunque no haya .poly-card).
  console.log(
    `    [debug] statusCode=${meta.statusCode ?? "?"} htmlLen=${html.length} tienePolyCard=${html.includes("poly-card")} title="${(meta.title || "").toString().slice(0, 80)}" waitMs=${waitMs}`
  );
  console.log(`    [debug] texto: "${bodyTextGuess}"`);
  if (meta.error) console.log(`    [debug] metadata.error: ${JSON.stringify(meta.error).slice(0, 200)}`);

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
  // Orden de scrapeo mezclado cada corrida — el orden mostrado en la webapp
  // (mlwatch:keywords, más abajo) usa siempre el orden original del archivo.
  const scrapeOrder = shuffle(keywords);
  console.log(`Scrapeando ${keywords.length} palabras clave vía Firecrawl (orden esta corrida: ${scrapeOrder.join(", ")})...`);

  const errors = {};
  const emptyResults = [];
  const now = Date.now();

  for (const keyword of scrapeOrder) {
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
    // Pausa aleatoria entre palabras clave (no siempre la misma), para que
    // el patrón de tráfico no sea perfectamente regular.
    await sleep(randomInt(DELAY_BETWEEN_KEYWORDS_MIN_MS, DELAY_BETWEEN_KEYWORDS_MAX_MS));
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
