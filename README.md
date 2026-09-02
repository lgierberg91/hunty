# ML Watch

Webapp chiquita para revisar publicaciones **usadas** de camisetas de fútbol
en Mercado Libre. Tiene dos partes:

1. Un **scraper real** (vía Apify) que revisa "Camiseta Huracán" en condición
   Usado 3 veces por día y te avisa con push cuando encuentra algo nuevo —
   la única búsqueda que vale la pena automatizar porque el artículo es
   puntual.
2. Los **10 links manuales** de siempre (Huracan, Boca, River, etc.) para
   las búsquedas más genéricas, que abrís vos con un botón — ver la sección
  "Cómo funciona ahora (versión 2)" más abajo.

## Scraper de Huracán (versión 3, vía Apify)

Esta parte sí scrapea Mercado Libre — pero no de la forma que fallaba antes
(nuestro propio código pegándole directo, que ML detectaba como bot). Usamos
un actor de terceros ya armado para esto, [MercadoLibre Scraper de
scrapers_lat](https://apify.com/scrapers_lat/mercadolibre-scraper), corriendo
en la infraestructura de [Apify](https://apify.com) con sus propios proxies.

- `scripts/scrape.js` corre 3 veces por día (10:00, 15:00 y 22:00 ART) desde
  `.github/workflows/scrape.yml`, le pide al actor hasta 3 resultados de
  "Camiseta Huracan" en Usado, y los compara contra lo que ya había visto
  (guardado en Redis, `mlwatch:scrape:seen:huracan-usado`).
- Si encuentra algo que no estaba antes, manda una notificación push
  puntual ("Hay publicaciones nuevas: 1 en Huracán usado...") — distinta del
  recordatorio genérico de las 10 búsquedas manuales.
- El resultado de cada corrida queda guardado en
  `mlwatch:scrape:catalog:huracan-usado` y la webapp lo muestra arriba de
  todo, con imagen, precio y badge **NUEVO**.

**Costo:** con esta config (1 búsqueda, 3 corridas/día, 3 resultados por
corrida) sale ~$4 USD/mes, dentro del crédito gratis de $5/mes que da Apify
— no debería salir de tu bolsillo, pero si en algún momento el actor sube de
precio o cambiás la config, revisalo en tu cuenta de Apify (Usage & Billing).

**Para sumar otra búsqueda** (por ejemplo la Adidas genérica 80-90s que
quedó afuera por ahora): agregá una entrada más en
`lib/scrapedSearches.js` con su propio `key`, `searchTerms`, `condition`
("new"/"used"/"refurbished") y `maxListings`. Ojo con el costo: cada
búsqueda adicional multiplica el número de resultados por corrida.

## Cómo funciona ahora (versión 2)

La versión anterior usaba un scraper (Firecrawl) corriendo en GitHub Actions.
Confirmamos que Mercado Libre le mostraba a Firecrawl la pantalla de login
("¡Hola! Para continuar, ingresa a tu cuenta...") en cada pedido — es decir,
lo trataba como tráfico no confiable, igual que había pasado antes con
Playwright. No hay forma gratuita y confiable de scrapear Mercado Libre desde
un servidor.

Así que dimos vuelta el enfoque: **en vez de que un bot entre a Mercado
Libre por vos, entrás vos** — a tu Mercado Libre real, ya logueado, sin
ningún tipo de automatización de por medio. La webapp ya no guarda ningún
catálogo ni hace scraping; es simplemente:

1. **Un botón** ("🔍 Abrir las 10 búsquedas") que te abre, en pestañas
   nuevas, las 10 búsquedas ya armadas y filtradas a "Usado" en
   listado.mercadolibre.com.ar. Como las abrís vos con un clic, en tu propio
   navegador logueado, no hay ningún riesgo de que Mercado Libre lo trate
   como un bot.
2. **Un recordatorio** — una notificación push del navegador, dos veces por
   día (~10:00 y ~20:00 ART), para acordarte de venir a apretar el botón.
   Esto lo manda un workflow de GitHub Actions (`remind.yml`) que le pega a
   nuestro propio servidor de notificaciones (no a Mercado Libre), así que
   tampoco hay riesgo de detección ahí.

No hay catálogo acumulado ni badge de "NUEVO" — es simplemente un atajo a
las búsquedas reales, para no tener que escribir las 10 cada vez.

## Los 10 links (`lib/keywords.js`)

Cada palabra clave tiene un link directo ya armado. Se construyeron
navegando de verdad en Mercado Libre: categoría "Camisetas de futbol" →
filtro **Equipo** → filtro **Condición: Usado** → se copió la URL final
(sin el fragmento `#...` que solo sirve para la animación del filtro).

De las 10, **8 ya quedaron confirmadas así** (`verified: true` en el
archivo): Huracan, Camisetas de futbol, Camisetas, Boca, River, Racing,
Argentina e Independiente. Solo **San Lorenzo y Velez** siguen con un link
de búsqueda simple (`verified: false`) que funciona pero puede no traer el
filtro "Usado" ya aplicado — capaz haga falta un clic tuyo en "Usado" del
panel de filtros de la izquierda la primera vez.

Es una limitación de esta sesión: cada vez que fui a buscar esos 2 en tu
navegador, Mercado Libre empezó a tardar cada vez más en cargar la página
(hasta quedarse colgada sin error, sin captcha, nada) — la misma firma de
"no confío en este tráfico" que ya habíamos visto con Firecrawl, esta vez
en tu sesión real. Como sospechamos que es por la cantidad de navegaciones
automáticas seguidas que hice yo (no algo que vaya a pasarte a vos
abriendo un link por vez a tu ritmo), preferí frenar ahí antes de seguir
insistiéndole a tu cuenta.

**Para terminar de verificar los 2 que faltan (te toma ~1 minuto, a tu
propio ritmo, sin ningún riesgo):**

1. Abrí este link (ya viene con Usado aplicado, sin filtrar por equipo):
   `https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/camisetas-de-futbol_NoIndex_True`
2. En el panel de filtros de la izquierda, buscá **Equipo** → si el que
   necesitás no aparece en la lista corta, apretá "Mostrar más" ahí mismo.
3. Hacé clic en el equipo (ej. "Huracán"). La página va a recargar con la
   URL final ya armada (con `/usado/<equipo>/` en el medio).
4. Copiá esa URL (sin el `#...` de al final) y pegámela, o reemplazá el
   campo `url` de ese equipo directo en `lib/keywords.js` y ponele
   `verified: true`.

## Recordatorio push — cómo activarlo

Una vez desplegado (ver Setup abajo), entrá a la webapp y apretá **"Activar
recordatorio"**. El navegador te va a pedir permiso de notificaciones —
aceptalo. A partir de ahí, dos veces por día vas a recibir una notificación
tipo "Es hora de revisar las camisetas usadas en Mercado Libre" que te lleva
directo a la webapp. Podés desactivarlo en cualquier momento con el mismo
botón.

Funciona por navegador/dispositivo — si lo activás en el celu y en la
notebook, quedan los dos suscriptos.

## Setup

### 1. Variables de entorno en Vercel

Las de Upstash ya deberían estar. Sumá esta nueva (clave **pública**, no
pasa nada si se ve en el código del navegador — es como funciona VAPID):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<te paso el valor por chat>
```

Después de cargarla, hacé `vercel --prod` de nuevo (o un redeploy desde el
dashboard) para que la tome — las variables `NEXT_PUBLIC_*` se graban en el
build, no alcanza con reiniciar.

Ya **no hace falta** `FIRECRAWL_API_KEY` ni `GITHUB_TOKEN` — los podés
borrar de Vercel si querés (el botón "Rastrear ahora" y el trigger manual
desaparecieron).

### 2. Secrets en GitHub (para el recordatorio)

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**. Las de Upstash son las mismas que ya tenías cargadas
para el scraper viejo (si las habías borrado, son las mismas de Vercel):

```
UPSTASH_REDIS_REST_URL=<la misma de Vercel>
UPSTASH_REDIS_REST_TOKEN=<la misma de Vercel>
VAPID_PUBLIC_KEY=<te paso el valor por chat>
VAPID_PRIVATE_KEY=<te paso el valor por chat — este NO va en Vercel, es solo para que GitHub Actions pueda firmar los pushes>
APIFY_API_TOKEN=<el token que copiaste de apify.com → Settings → API & Integrations>
```

Podés borrar el secret `FIRECRAWL_API_KEY`, ya no se usa.

### 3. Probar sin esperar al horario programado

- Recordatorio genérico (10 búsquedas manuales): Actions → workflow
  **"Recordatorio ML Watch"** → **Run workflow**.
- Scraper de Huracán: Actions → workflow **"Scraper Huracán (Apify)"** →
  **Run workflow**. Mirá los logs de esa corrida — imprime cuántos
  resultados trajo y, si algo no matchea bien (precio o imagen vacíos), las
  claves del primer resultado para poder ajustar `scripts/scrape.js`.

Si ya activaste el recordatorio en la webapp, en cualquiera de los dos casos
deberías recibir la notificación en menos de un minuto (el del scraper solo
si encontró algo nuevo esa corrida).

## Límites / cosas a saber

- Vercel, Upstash, GitHub Actions (el repo es público, sin límite de
  minutos) y las notificaciones push siguen siendo gratis. El scraper de
  Huracán vía Apify es la única parte que tiene un costo real, aunque
  chico (~$4 USD/mes, dentro del crédito gratis de Apify — ver la sección
  del scraper más arriba).
- El catálogo de Huracán es lo único con historial real (detecta "nuevo" de
  verdad, comparando corridas). Las otras 9 búsquedas siguen sin catálogo
  acumulado — cada vez que apretás el botón, ves los resultados de Mercado
  Libre en el momento, tal cual los verías buscando vos a mano.
- El recordatorio genérico (dos veces por día) solo te avisa que es hora de
  mirar las búsquedas manuales — no sabe si hay algo nuevo o no en esas 9.
  Si más adelante querés eso para alguna de ellas también, es cuestión de
  sumarla a `lib/scrapedSearches.js` (ver la sección del scraper).
