# ML Watch

Webapp chiquita para ver publicaciones nuevas de Mercado Libre por palabra clave
("Boca", "River", "camisetas", etc.), con badge de "NUEVO" y 100% gratis para hostear.

## Cómo funciona

- El **backend** (rutas de API de Next.js) le pega a la API oficial de búsqueda de
  Mercado Libre (`/sites/MLA/search`) por cada palabra clave.
- Esa API **requiere estar logueado vía OAuth** (ya no es abierta). Por eso hay
  un login único contra tu propia cuenta de Mercado Libre, y el token se guarda
  en una base Redis gratuita (Upstash) para que se vaya renovando solo.
- El **frontend** guarda en el navegador (localStorage) qué IDs de publicaciones
  ya viste, para marcar como "NUEVO" solo lo que apareció desde la última vez.
  Esto es por navegador/dispositivo — no hace falta base de datos para eso.
- Las palabras clave se guardan también en tu navegador, así que las podés
  agregar/sacar desde la webapp sin tocar código.

## 1. Crear la app en Mercado Libre (gratis)

1. Entrá a https://developers.mercadolibre.com.ar/ con tu cuenta de ML.
2. "Crear aplicación" (o "Mis aplicaciones" → "Crear nueva aplicación").
3. Completá los campos. Lo único que importa acá:
   - **Redirect URI**: por ahora poné `http://localhost:3000/api/auth/callback`
     (cuando despliegues en Vercel, agregás también la URL de producción).
4. Guardá el `Client ID` y el `Client Secret` que te da.

## 2. Crear la base Redis gratis (Upstash)

1. Entrá a https://upstash.com/ y creá una cuenta gratis.
2. Creá una base "Redis" (Free tier alcanza de sobra para esto).
3. Copiá el `UPSTASH_REDIS_REST_URL` y el `UPSTASH_REDIS_REST_TOKEN` que te muestra.

## 3. Configurar variables de entorno

Copiá `.env.example` a `.env.local` y completá los valores:

```
ML_CLIENT_ID=...
ML_CLIENT_SECRET=...
ML_REDIRECT_URI=http://localhost:3000/api/auth/callback
ML_SITE_ID=MLA
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## 4. Probar en local

```bash
npm install
npm run dev
```

Abrí http://localhost:3000 — te va a aparecer un botón "Autorizar ahora".
Hacé click, logueate con tu cuenta de Mercado Libre, aceptá los permisos, y
volvés automáticamente a la app ya autorizada. Este paso se hace **una sola vez**
(el token se renueva solo después).

## 5. Desplegar gratis en Vercel

1. Subí este proyecto a un repo de GitHub.
2. Entrá a https://vercel.com/, "Add New Project", importá el repo.
3. En "Environment Variables" cargá las mismas variables del `.env.local`,
   pero con `ML_REDIRECT_URI=https://TU-APP.vercel.app/api/auth/callback`
   (usá la URL real que te asigna Vercel).
4. Deploy.
5. Volvé a la app de Mercado Libre (paso 1) y agregá esa misma URL de producción
   como otra Redirect URI válida.
6. Entrá a `https://TU-APP.vercel.app/api/auth/start` una vez para autorizar
   en producción (es el mismo paso que en local, contra el token de prod).

Listo: la URL de Vercel es tu webapp, la podés abrir desde el celu o la compu
cuando quieras.

## Límites / cosas a saber

- El plan free de Upstash y Vercel alcanzan sobra para uso personal (unas
  pocas búsquedas por visita).
- El "NUEVO" es por navegador (localStorage). Si abrís desde otro dispositivo,
  al principio te va a marcar todo como nuevo una vez, y después ya sigue el
  historial de ese dispositivo.
- Esto NO manda notificaciones solo — es "abrís la página y ves lo nuevo".
  Si más adelante querés que te avise (mail, Telegram) sin que abras la app,
  el siguiente paso natural es un Vercel Cron Job que corra el mismo fetch
  cada X horas, guarde los IDs vistos en Redis (server-side en vez de
  localStorage) y dispare un mensaje cuando encuentre algo nuevo. Puedo armarte
  esa parte también si querés avanzar con eso.
