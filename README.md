# ML Watch

Webapp chiquita y gratis para ver, cada hora, las publicaciones **usadas**
nuevas de Mercado Libre por palabra clave ("Boca", "River", "camisetas",
etc.), acumuladas en un catálogo de hasta 48hs con badge de "NUEVO",
ordenado de más nuevo a más viejo.

## Cómo funciona

Son dos partes separadas, las dos gratis:

1. **El scraper** (`/scraper`): un script de Node + Playwright (navegador
   real) que corre **una vez por hora** en GitHub Actions. Para cada palabra
   clave en `scraper/keywords.json` abre la búsqueda de Mercado Libre
   filtrada a condición **"Usado"**, saca los resultados orgánicos (no los
   "Promocionados"), y los guarda en una base Redis gratuita (Upstash):
   - `mlwatch:itemdata:<keyword>` — datos de cada publicación (título,
     precio, foto, link), siempre actualizados con lo último visto.
   - `mlwatch:feed:<keyword>` — un registro de "cuándo vi cada publicación
     por primera vez", que se poda automáticamente a una ventana de 48hs.
     Esto es lo que arma el catálogo acumulado: no importa si no abrís la
     app en todo el día, el feed va guardando todo lo que fue apareciendo.

2. **La webapp** (Next.js en Vercel): solo *lee* lo que el scraper ya dejó
   guardado en Redis, así que abre siempre al instante. Tiene un filtro de
   "últimas 2 / 6 / 24 / 48 horas" y muestra todo ordenado de más nuevo a
   más viejo, con badge "NUEVO" para lo agregado en la última hora y media.

No hace falta crear ninguna app en Mercado Libre ni loguearse con OAuth —
eso era necesario para pegarle a la API oficial de búsqueda, que Mercado
Libre cerró para apps de terceros. Este enfoque scrapea la web pública
directamente con un navegador, como lo haría una persona.

> ⚠️ **Dos cosas sin confirmar 100% en un scrape real todavía** (se
> implementaron con el mejor criterio disponible, pero conviene revisarlas
> después de la primera corrida real en GitHub Actions):
> 1. El filtro de condición "Usado" en la URL (`_ITEM%2ACONDITION_2230581`).
>    Si Mercado Libre cambió ese ID, el scraper cae automáticamente a
>    traer todo sin filtrar por condición para esa palabra clave (mejor
>    tener resultados de más que quedarte sin nada), y lo vas a poder ver
>    en los logs de GitHub Actions como advertencia.
> 2. La consulta a Redis que arma el orden "más nuevo primero" en
>    `app/api/search/route.js`. La lógica está probada localmente, pero no
>    pude probarla en vivo contra tu base de Upstash desde este entorno
>    (el sandbox no tiene salida de red a `upstash.io`). Si al abrir la
>    app ves algo raro en el orden, avisame y lo ajustamos.

## 1. Configurar el scraper (GitHub Actions)

El repo ya incluye `scraper/` y `.github/workflows/scrape.yml`, configurado
para correr cada hora en punto. Solo falta darle acceso a tu Redis:

1. En GitHub, andá a tu repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Creá estos dos secrets (los mismos valores que ya usás en Vercel):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Para no esperar hasta la próxima hora en punto: andá a la pestaña
   **Actions** del repo → workflow **"Scrape Mercado Libre"** → botón
   **"Run workflow"** → **Run workflow**. Tarda 1-3 minutos; podés ver el
   progreso y los logs ahí mismo.

Si querés editar las palabras clave, es el archivo `scraper/keywords.json`
(un array de strings) — cambiálo, hacé commit y push, y el próximo scrape
ya las usa.

## 2. La webapp en Vercel

Ya está desplegada. Las únicas variables de entorno que necesita son las
mismas de Upstash:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Si en algún momento limpiás las variables viejas de Mercado Libre
(`ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_SITE_ID`) de
Vercel, no pasa nada — ya no se usan, quedaron de un enfoque anterior
(OAuth contra la API oficial) que Mercado Libre bloqueó para apps nuevas.
Podés borrarlas cuando quieras o dejarlas, es indistinto.

## Límites / cosas a saber

- El plan free de Upstash y GitHub Actions alcanzan de sobra para este uso
  (1 scrape por hora, ~10 palabras clave).
- El catálogo se poda solo a 48hs — no vas a acumular publicaciones viejas
  para siempre.
- Esto sigue siendo "abrís la webapp y ves lo nuevo", no manda notificaciones
  push ni mensajes. Si más adelante lo querés, el siguiente paso natural es
  que el mismo workflow de GitHub Actions, además de guardar en Redis,
  mande un mensaje (mail, Telegram, etc.) cuando encuentre algo nuevo. Se
  puede armar reutilizando el mismo scraper.
