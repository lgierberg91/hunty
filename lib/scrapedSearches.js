// Búsquedas que el scraper de Apify revisa automáticamente (a diferencia de
// las de lib/keywords.js, que son links para que abras vos a mano en tu
// propio Mercado Libre). Por ahora es solo Huracán usado — un artículo
// puntual, así que con pocos resultados por corrida alcanza y el costo en
// Apify se mantiene mínimo (~$4/mes con esta config, dentro del crédito
// gratis de $5/mes que da Apify). Ver README para cómo sumar otra búsqueda
// más adelante (por ejemplo la Adidas genérica 80-90s que quedó afuera por
// ahora).
export const SCRAPED_SEARCHES = [
  {
    key: "huracan-usado",
    label: "Camiseta Huracán (usado)",
    searchTerms: ["Camiseta Huracan"],
    country: "ar",
    condition: "used",
    maxListings: 3,
  },
];
