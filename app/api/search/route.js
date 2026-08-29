import { NextResponse } from "next/server";
import { getRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

// Esta ruta ya NO le pega a Mercado Libre en el momento en que alguien abre
// la webapp. Lee el "feed" que el scraper (GitHub Actions, ver /scraper) va
// armando en Redis cada hora: para cada palabra clave hay
//   - mlwatch:feed:<keyword>      (sorted set: id -> primera vez que lo vimos)
//   - mlwatch:itemdata:<keyword>  (hash: id -> datos del item, siempre al día)
// Así la respuesta es instantánea, y podemos devolver "todo lo que apareció
// en las últimas N horas" aunque el usuario no haya mirado la app en horas.

const DEFAULT_HOURS = 24;
const MAX_HOURS = 48;

export async function GET(request) {
  const redis = getRedis();

  const qParam = request.nextUrl.searchParams.get("q") || "";
  let keywords = qParam
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    keywords = (await redis.get("mlwatch:keywords")) || [];
  }

  let hours = parseInt(request.nextUrl.searchParams.get("hours"), 10);
  if (!Number.isFinite(hours) || hours <= 0) hours = DEFAULT_HOURS;
  hours = Math.min(hours, MAX_HOURS);

  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const results = {};
  const errors = {};

  await Promise.all(
    keywords.map(async (keyword) => {
      try {
        const feedKey = `mlwatch:feed:${keyword}`;
        const dataKey = `mlwatch:itemdata:${keyword}`;

        // Ids vistos por primera vez dentro de la ventana, en orden ascendente
        // (más viejo primero) — los damos vuelta después para que quede de
        // más nuevo a más viejo, como pidió Leo.
        const raw = await redis.zrange(feedKey, since, now, {
          byScore: true,
          withScores: true,
        });

        const pairs = [];
        for (let i = 0; i < raw.length; i += 2) {
          pairs.push({ id: String(raw[i]), firstSeenAt: Number(raw[i + 1]) });
        }
        pairs.reverse();

        if (pairs.length === 0) {
          results[keyword] = [];
          return;
        }

        const rawItems = await redis.hmget(dataKey, ...pairs.map((p) => p.id));

        results[keyword] = pairs
          .map(({ id, firstSeenAt }) => {
            const value = rawItems ? rawItems[id] : null;
            if (!value) return null;
            const item = typeof value === "string" ? JSON.parse(value) : value;
            return { ...item, firstSeenAt };
          })
          .filter(Boolean);
      } catch (err) {
        errors[keyword] = String(err.message || err);
      }
    })
  );

  const lastScraped = await redis.get("mlwatch:lastScraped");
  const lastErrors = (await redis.get("mlwatch:lastErrors")) || {};

  return NextResponse.json({
    ok: true,
    hours,
    keywords,
    results,
    errors,
    lastScraped,
    lastErrors,
  });
}
