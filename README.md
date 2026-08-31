# ML Watch

Webapp chiquita y gratis para ver, un par de veces por día, las publicaciones
**usadas** nuevas de Mercado Libre por palabra clave ("Boca", "River",
"camisetas", etc.), acumuladas en un catálogo de hasta 48hs con badge de
"NUEVO", ordenado de más nuevo a más viejo.

## Cómo funciona

Son dos partes separadas, las dos gratis:

1. **El scraper** (`/scraper`): un script de Node que corre en GitHub
   Actions **dos veces por día** (10:00 y 20:00 hora Argentina, ajustable en
   `.github/workflows/scrape.yml`). Para cada palabra clave en
   `scraper/keywords.json` le pide a **Firecrawl** (un servicio de scraping)
   el HTML ya renderizado de la búsqueda filtrada a condición **"Usado"**,
   lo parsea acá para sacar los resultados orgánicos (no los
   "Promocionados"), y los guarda en una base Redis gratuita (Upstash):
   - `mlwatch:itemdata:<keyword>` — datos de cada publicación (título,
     precio, foto, link), siempre actualizados con lo último visto.
   - `mlwatch:feed:<keyword>` — un registro de "cuándo vi cada publicación
     por primera vez", que se poda automáticamente a una ventana de 48hs.
     Esto es lo que arma el catálogo acumulado.

2. **La webapp** (Next.js en Vercel): solo *lee* lo que el scraper ya dejó
   guardado en Redis, así que abre siempre al instante. Tiene un filtro de
   "últimas 2 / 6 / 24 / 48 horas" y muestra todo ordenado de más nuevo a
   más viejo, con badge "NUEVO" para lo agregado recientemente.

## Por qué Firecrawl y no un navegador propio

La primera versión de esto usaba Playwright (un navegador real) corriendo
en GitHub Actions. Antes de que Leo empezara a usarlo, encontramos algo
importante probando en vivo, **en su propio navegador logueado** (no en un
servidor): al abrir una búsqueda de Mercado Libre de forma automatizada, la
página cargaba bien (HTTP 200 en todo, sin captcha ni error visible) pero
el listado de resultados quedaba vacío — 0 publicaciones, sin ningún error.
Eso es la firma típica de detección de automatización de navegador (no de
bloqueo por IP): Mercado Libre nota que el navegador está siendo manejado
por código y no entrega los datos, en vez de mostrar un bloqueo visible.

Como esa detección es sobre el navegador automatizado en sí (Playwright
maneja Chrome con el mismo protocolo que usamos para probar), correrlo
desde otro lado (Cloudflare Workers, un servidor propio, etc.) no iba a
solucionar nada. Por eso pasamos a Firecrawl: es un servicio pensado
específicamente para esquivar este tipo de detección (agrega esa
complejidad para vos). No hay garantía de que funcione siempre —Mercado
Libre puede endurecer sus defensas en cualquier momento— pero es la mejor
opción realista dentro de un presupuesto gratis.

> ⚠️ Si después de un tiempo notás que `lastErrors` en Redis (o los logs de
> GitHub Actions) muestran seguido "0 resultados" para casi todas las
> palabras clave, probablemente Mercado Libre también le está bloqueando el
> acceso a Firecrawl. En ese caso, antes de gastar en un plan pago, vale la
> pena revisar si Mercado Libre tiene una función nativa de **"crear
> alerta"** sobre una búsqueda guardada (existe al menos en la versión de
> México; no confirmamos si está en Argentina) — te avisaría de
> publicaciones nuevas sin necesidad de scrapear nada.

## Presupuesto de créditos (por qué es 2 veces por día y no cada hora)

Firecrawl da **1.000 créditos gratis por mes**, y cada página que pedimos
cuesta **1 crédito** (usamos el formato HTML simple, no la extracción con
IA, que cuesta 5x más). Con 10 palabras clave:

```
10 palabras clave × 2 scrapeos/día × 30 días = 600 créditos/mes
```

Deja margen para agregar alguna palabra clave más o correr el workflow
manualmente unas cuantas veces sin quedarte sin créditos. Si en algún
momento querés más frecuencia, hacé la cuenta antes de subir el cron: cada
hora en vez de 2 veces por día sería 10 × 24 × 30 = 7.200 créditos/mes, muy
por arriba del plan gratis (necesitarías un plan pago).

## 1. Crear tu cuenta de Firecrawl (gratis)

Esto lo tenés que hacer vos — no puedo crear cuentas en tu nombre:

1. Entrá a https://www.firecrawl.dev/ y creá una cuenta gratis.
2. En el dashboard, copiá tu **API key** (empieza con `fc-...`).

## 2. Configurar el scraper (GitHub Actions)

El repo ya incluye `scraper/` y `.github/workflows/scrape.yml`, configurado
para correr dos veces por día. Solo falta darle las credenciales:

1. En GitHub, andá a tu repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Creá estos tres secrets:
   - `UPSTASH_REDIS_REST_URL` (el mismo valor que ya usás en Vercel)
   - `UPSTASH_REDIS_REST_TOKEN` (ídem)
   - `FIRECRAWL_API_KEY` (el que copiaste en el paso 1)
3. Para no esperar hasta el próximo horario programado: andá a la pestaña
   **Actions** del repo → workflow **"Scrape Mercado Libre"** → botón
   **"Run workflow"** → **Run workflow**. Tarda menos de un minuto; podés
   ver el progreso y los logs ahí mismo — es el mejor lugar para confirmar
   si Firecrawl está trayendo resultados o no.

Si querés editar las palabras clave, es el archivo `scraper/keywords.json`
(un array de strings) — cambiálo, hacé commit y push, y el próximo scrape
ya las usa. Los horarios están en `.github/workflows/scrape.yml` (línea del
`cron`), en formato UTC.

## 3. La webapp en Vercel

Ya está desplegada. Las únicas variables de entorno que necesita son las de
Upstash (no necesita la de Firecrawl, esa la usa solo el scraper):

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Límites / cosas a saber

- El plan free de Upstash, GitHub Actions y Firecrawl alcanzan de sobra
  para este uso, según la cuenta de créditos de arriba.
- El catálogo se poda solo a 48hs — no vas a acumular publicaciones viejas
  para siempre.
- Esto sigue siendo "abrís la webapp y ves lo nuevo", no manda
  notificaciones push ni mensajes.
