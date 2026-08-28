import { NextResponse } from "next/server";
import { getValidAccessToken } from "../../../lib/mlAuth";

export const dynamic = "force-dynamic";

const SITE_ID = process.env.ML_SITE_ID || "MLA";

function upgradeThumbnail(url) {
  if (!url) return url;
  return url.replace(/^http:/, "https:").replace(/-I\.(jpg|webp)$/i, "-O.$1");
}

async function searchOne(keyword, accessToken) {
  const url = new URL(`https://api.mercadolibre.com/sites/${SITE_ID}/search`);
  url.searchParams.set("q", keyword);
  url.searchParams.set("limit", "30");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Evita que Next cachee resultados viejos.
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML search falló para "${keyword}": ${res.status} ${text}`);
  }

  const json = await res.json();

  return (json.results || []).map((item) => ({
    id: item.id,
    title: item.title,
    price: item.price,
    currency: item.currency_id,
    permalink: item.permalink,
    thumbnail: upgradeThumbnail(item.thumbnail),
    condition: item.condition,
    freeShipping: !!(item.shipping && item.shipping.free_shipping),
    seller: item.seller && item.seller.nickname,
    keyword,
  }));
}

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const keywords = q
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return NextResponse.json({ ok: false, error: "Pasá al menos una keyword con ?q=" }, { status: 400 });
  }

  let accessToken;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.startsWith("NOT_AUTHORIZED")) {
      return NextResponse.json(
        { ok: false, error: "not_authorized", authUrl: "/api/auth/start" },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const results = {};
  const errors = {};

  await Promise.all(
    keywords.map(async (keyword) => {
      try {
        results[keyword] = await searchOne(keyword, accessToken);
      } catch (err) {
        errors[keyword] = String(err.message || err);
      }
    })
  );

  return NextResponse.json({ ok: true, results, errors });
}
