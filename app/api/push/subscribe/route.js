import { NextResponse } from "next/server";
import { getRedis } from "../../../../lib/redis";

export const dynamic = "force-dynamic";

// Guarda la suscripción push del navegador de Leo. Se guarda como un hash
// en Redis (mlwatch:push:subscriptions), una entrada por endpoint — así si
// se suscribe desde el celu y la notebook quedan las dos, y si el navegador
// rota el endpoint (pasa cada tanto) la entrada vieja simplemente queda sin
// usarse (se limpia sola si send-reminder.js ve que ya no es válida).

export async function POST(request) {
  const subscription = await request.json().catch(() => null);

  if (!subscription?.endpoint) {
    return NextResponse.json({ ok: false, error: "Falta la suscripción." }, { status: 400 });
  }

  const redis = getRedis();
  await redis.hset("mlwatch:push:subscriptions", {
    [subscription.endpoint]: JSON.stringify(subscription),
  });

  return NextResponse.json({ ok: true });
}
