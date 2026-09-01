import { NextResponse } from "next/server";
import { getRedis } from "../../../../lib/redis";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);

  if (!body?.endpoint) {
    return NextResponse.json({ ok: false, error: "Falta el endpoint." }, { status: 400 });
  }

  const redis = getRedis();
  await redis.hdel("mlwatch:push:subscriptions", body.endpoint);

  return NextResponse.json({ ok: true });
}
