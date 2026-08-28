import { Redis } from "@upstash/redis";

let client = null;

// Se crea recién cuando se usa (no al importar el módulo), así el build
// no explota si todavía no cargaste las variables de entorno de Upstash.
export function getRedis() {
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return client;
}
