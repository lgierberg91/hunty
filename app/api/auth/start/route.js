import { NextResponse } from "next/server";
import { getAuthorizationUrl } from "../../../../lib/mlAuth";

export const dynamic = "force-dynamic";

// Visitá /api/auth/start UNA sola vez (logueado con tu cuenta de Mercado Libre)
// para autorizar la app. Te redirige a Mercado Libre y de ahí vuelve a /api/auth/callback.
export async function GET() {
  return NextResponse.redirect(getAuthorizationUrl());
}
