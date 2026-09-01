# ML Watch

Webapp chiquita y gratis para revisar, vos mismo, las publicaciones **usadas**
de camisetas de fútbol en Mercado Libre — por las mismas 10 palabras clave de
siempre ("Huracan", "Boca", "River", etc.), pero ya no scrapea nada.

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

De las 10, **5 quedaron confirmadas así** (`verified: true` en el archivo):
Camisetas de futbol, Camisetas, Boca, River y Argentina. Las otras 5
(**Huracan, Racing, Independiente, San Lorenzo, Velez**) tienen por ahora un
link de búsqueda simple (`verified: false`) que funciona pero puede no
traer el filtro "Usado" ya aplicado — capaz haga falta un clic tuyo en
"Usado" del panel de filtros de la izquierda la primera vez.

Es una limitación de esta sesión: cuando fui a buscar esos 5 en tu
navegador, Mercado Libre empezó a tardar cada vez más en cargar la página
(hasta quedarse colgada sin error, sin captcha, nada) — la misma firma de
"no confío en este tráfico" que ya habíamos visto con Firecrawl, esta vez
en tu sesión real. Como sospechamos que es por la cantidad de navegaciones
automáticas seguidas que hice yo (no algo que vaya a pasarte a vos
abriendo un link por vez a tu ritmo), preferí frenar ahí antes de seguir
insistiéndole a tu cuenta.

**Para terminar de verificar los 5 que faltan (te toma ~2 minutos, a tu
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
```

Podés borrar el secret `FIRECRAWL_API_KEY`, ya no se usa.

### 3. Probar el recordatorio sin esperar al horario programado

Actions → workflow **"Recordatorio ML Watch"** → **Run workflow**. Si ya
activaste el recordatorio en la webapp, deberías recibir la notificación en
menos de un minuto.

## Límites / cosas a saber

- Todo esto sigue siendo 100% gratis: Vercel, Upstash, GitHub Actions
  (el repo es público, así que las Actions no tienen límite de minutos) y
  las notificaciones push del navegador no tienen costo ni límite práctico
  para este volumen.
- No hay catálogo acumulado ni historial — cada vez que apretás el botón,
  ves los resultados de Mercado Libre en el momento, tal cual los verías
  buscando vos a mano.
- El recordatorio solo te avisa que es hora de mirar — no te dice si hay
  algo nuevo o no. Si más adelante querés eso de vuelta, la única forma
  confiable sería que Mercado Libre tenga una función nativa de alertas
  guardadas (no encontramos que exista en Argentina) — cualquier otra cosa
  vuelve a depender de scrapear, que es justo lo que veníamos evitando.
