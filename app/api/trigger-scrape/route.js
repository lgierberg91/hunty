import { NextResponse } from "next/server";
import { getRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

// Dispara manualmente el workflow de GitHub Actions que corre el scraper
// (scraper/scrape.js vía Firecrawl), para no tener que ir a la pestaña
// Actions de GitHub cada vez que Leo quiere forzar un rastreo.
//
// Necesita un token de GitHub (GITHUB_TOKEN en las env vars de Vercel) con
// permiso de "Actions: Read and write" sobre este repo — ver README.
//
// Tiene un límite de un disparo manual cada 10 minutos (guardado en Redis)
// para que no se gasten créditos de Firecrawl de más si alguien aprieta el
// botón varias veces seguidas.

const GITHUB_OWNER = "lgierberg91";
const GITHUB_REPO = "hunty";
const WORKFLOW_FILE = "scrape.yml";
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function POST() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Falta configurar GITHUB_TOKEN en las variables de entorno de Vercel." },
      { status: 500 }
    );
  }

  const redis = getRedis();
  const lastTriggerKey = "mlwatch:lastManualTrigger";
  const now = Date.now();

  const last = await redis.get(lastTriggerKey);
  if (last && now - Number(last) < MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - Number(last))) / 1000);
    return NextResponse.json(
      { ok: false, error: `Esperá ~${waitSec}s antes de disparar otro rastreo manual (para no gastar créditos de más).` },
      { status: 429 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `GitHub respondió ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 }
    );
  }

  await redis.set(lastTriggerKey, now);

  return NextResponse.json({ ok: true });
}
