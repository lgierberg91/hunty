import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "../../../../lib/mlAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Falta el parámetro 'code' en la respuesta de Mercado Libre." },
      { status: 400 }
    );
  }

  try {
    await exchangeCodeForTokens(code);
    // Listo: el token queda guardado en Redis. Ya podés ir a la home de la app.
    return NextResponse.redirect(new URL("/?authorized=1", request.url));
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
