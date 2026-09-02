import { NextResponse } from "next/server";
import { getRedis } from "../../../lib/redis";
import { SCRAPED_SEARCHES } from "../../../lib/scrapedSearches";

export const dynamic = "force-dynamic";

// Le devuelve a la webapp el catálogo que arma scripts/scrape.js (corrido
// 3 veces por día por GitHub Actions). Esta ruta no scrapea nada por sí
// misma — solo lee lo último que ya quedó guardado en Redis.
export async function GET() {
  const redis = getRedis();

  const results = await Promise.all(
    SCRAPED_SEARCHES.map(async (search) => {
      const raw = await redis.get(`mlwatch:scrape:catalog:${search.key}`);
      const items = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
      return { key: search.key, label: search.label, items };
    })
  );

  return NextResponse.json({ searches: results });
}
