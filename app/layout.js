import "./globals.css";

export const metadata = {
  title: "ML Watch",
  description: "Links directos a camisetas usadas en Mercado Libre, por palabra clave",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
