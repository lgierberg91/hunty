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
export const KEYWORDS = [
  {
    label: "Huracan",
    url: "https://listado.mercadolibre.com.ar/camiseta-huracan",
    verified: false,
  },
  {
    label: "Camisetas de futbol",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/camisetas-de-futbol_NoIndex_True",
    verified: true,
  },
  {
    label: "Camisetas",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/usado/camisetas_FILTRABLE*GENDER_18549360_NoIndex_True",
    verified: true,
  },
  {
    label: "Boca",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/boca-juniors/camisetas-de-futbol_NoIndex_True",
    verified: true,
  },
  {
    label: "River",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/river-plate/camisetas-de-futbol_NoIndex_True",
    verified: true,
  },
  {
    label: "Racing",
    url: "https://listado.mercadolibre.com.ar/camiseta-racing-club",
    verified: false,
  },
  {
    label: "Argentina",
    url: "https://listado.mercadolibre.com.ar/deportes-fitness/futbol/ropa-calzado/camisetas/usado/equipo-argentina/camisetas-de-futbol_NoIndex_True",
    verified: true,
  },
  {
    label: "Independiente",
    url: "https://listado.mercadolibre.com.ar/camiseta-independiente",
    verified: false,
  },
  {
    label: "San Lorenzo",
    url: "https://listado.mercadolibre.com.ar/camiseta-san-lorenzo-de-almagro",
    verified: false,
  },
  {
    label: "Velez",
    url: "https://listado.mercadolibre.com.ar/camiseta-velez-sarsfield",
    verified: false,
  },
];
