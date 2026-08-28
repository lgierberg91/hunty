import { getRedis } from "./redis";

const TOKEN_KEY = "ml:tokens";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

// Dominio de autorización por sitio. Agregá más si algún día buscás en otro país.
const AUTH_DOMAIN_BY_SITE = {
  MLA: "https://auth.mercadolibre.com.ar",
  MLB: "https://auth.mercadolivre.com.br",
  MLM: "https://auth.mercadolibre.com.mx",
};

export function getAuthorizationUrl() {
  const siteId = process.env.ML_SITE_ID || "MLA";
  const domain = AUTH_DOMAIN_BY_SITE[siteId] || AUTH_DOMAIN_BY_SITE.MLA;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ML_CLIENT_ID,
    redirect_uri: process.env.ML_REDIRECT_URI,
  });
  return `${domain}/authorization?${params.toString()}`;
}

async function saveTokens(tokenResponse) {
  const now = Date.now();
  const record = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    // Restamos 60s de margen de seguridad.
    expires_at: now + (tokenResponse.expires_in - 60) * 1000,
  };
  await getRedis().set(TOKEN_KEY, record);
  return record;
}

// Se llama una sola vez, desde /api/auth/callback, con el "code" que devuelve Mercado Libre.
export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    code,
    redirect_uri: process.env.ML_REDIRECT_URI,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo canjear el code por tokens: ${res.status} ${text}`);
  }

  const json = await res.json();
  return saveTokens(json);
}

async function refreshTokens(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ML_CLIENT_ID,
    client_secret: process.env.ML_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo refrescar el token: ${res.status} ${text}`);
  }

  const json = await res.json();
  return saveTokens(json);
}

// Devuelve un access_token válido, refrescándolo si hace falta.
// Tira un error con un mensaje claro si todavía no se hizo el login inicial.
export async function getValidAccessToken() {
  let record = await getRedis().get(TOKEN_KEY);

  if (!record) {
    throw new Error(
      "NOT_AUTHORIZED: todavía no autorizaste la app. Entrá a /api/auth/start una vez."
    );
  }

  if (Date.now() >= record.expires_at) {
    record = await refreshTokens(record.refresh_token);
  }

  return record.access_token;
}
