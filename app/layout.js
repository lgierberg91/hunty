import "./globals.css";

export const metadata = {
  title: "ML Watch",
  description: "Monitor de publicaciones nuevas en Mercado Libre por palabra clave",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
