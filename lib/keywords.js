// Los 10 links de búsqueda que Leo revisa a mano en su propio Mercado Libre
// logueado — reemplazan al scraper de Firecrawl (ver README, sección "Por
// qué ya no scrapeamos").
//
// `verified: true` significa que el link fue armado navegando de verdad en
// Mercado Libre (categoría "Camisetas de futbol" → filtro Equipo → filtro
// Condición: Usado) y confirmado que carga con el filtro "Usado" ya
// aplicado. `verified: false` significa que es un link de búsqueda simple
// (todavía sin el filtro "Usado" confirmado aplicado) — funciona, pero puede
// hacer falta un clic extra en "Usado" del panel de filtros de la
// izquierda. Ver README para cómo terminar de verificarlos vos (toma menos
// de un minuto por palabra).
//
// `colors` ([principal, secundario]) son los colores reales de la camiseta
// del club, usados para dibujar el escudo de cada card (no son el logo
// oficial, solo un círculo con esos colores + iniciales — así evitamos
// reproducir el isotipo del club). `icon` es para las dos palabras clave
// genéricas que no son de un club.
export const KEYWORDS = [
  {
    label: "Huracan",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/huracan/camiseta-huracan_AGE*GROUP_6725189_NoIndex_True",
    verified: true,
    colors: ["#f7941e", "#ffffff"],
    initials: "H",
  },
  {
    label: "Camisetas de futbol",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/camisetas-de-futbol_NoIndex_True",
    verified: true,
    icon: "👕",
  },
  {
    label: "Camisetas",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/usado/camisetas_FILTRABLE*GENDER_18549360_NoIndex_True",
    verified: true,
    icon: "👕",
  },
  {
    label: "Boca",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/boca-juniors/camisetas-de-futbol_NoIndex_True",
    verified: true,
    colors: ["#153c78", "#ffd200"],
    initials: "B",
  },
  {
    label: "River",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/river-plate/camisetas-de-futbol_NoIndex_True",
    verified: true,
    colors: ["#ffffff", "#d61e2b"],
    initials: "R",
  },
  {
    label: "Racing",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/racing-club/camisetas-de-futbol_NoIndex_True",
    verified: true,
    colors: ["#75c6ef", "#ffffff"],
    initials: "R",
  },
  {
    label: "Argentina",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/equipo-argentina/camisetas-de-futbol_NoIndex_True",
    verified: true,
    colors: ["#75aadb", "#ffffff"],
    initials: "AR",
  },
  {
    label: "Independiente",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/independiente/camisetas-de-futbol_NoIndex_True",
    verified: true,
    colors: ["#e2001a", "#ffffff"],
    initials: "I",
  },
  {
    label: "San Lorenzo",
    url: "https://listado.mercadolibre.com.ar/camiseta-san-lorenzo-de-almagro",
    verified: false,
    colors: ["#002856", "#d1001f"],
    initials: "SL",
  },
  {
    label: "Velez",
    url: "https://listado.mercadolibre.com.ar/camiseta-velez-sarsfield",
    verified: false,
    colors: ["#1a1a1a", "#ffffff"],
    initials: "V",
  },
];
