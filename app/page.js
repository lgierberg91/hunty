"use client";

import { useCallback, useEffect, useState } from "react";
import { KEYWORDS } from "../lib/keywords";

function slugify(label) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

// Conversión estándar de la clave pública VAPID (base64 url-safe) al
// Uint8Array que pide pushManager.subscribe(). Es el snippet que recomienda
// la documentación de Web Push, no hay vuelta que darle.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// "unsupported" | "unsubscribed" | "subscribing" | "subscribed" | "unsubscribing" | "error"
function useReminderStatus() {
  const [status, setStatus] = useState("unsupported");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "subscribed" : "unsubscribed");
      })
      .catch(() => setStatus("unsupported"));
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setError("Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY en Vercel.");
      setStatus("error");
      return;
    }
    setStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("unsubscribed");
        setError("No diste permiso de notificaciones — no puedo activar el recordatorio.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setStatus("subscribed");
    } catch (e) {
      setError("No se pudo activar el recordatorio: " + (e.message || e));
      setStatus("error");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setStatus("unsubscribing");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch (e) {
      setError("No se pudo desactivar: " + (e.message || e));
      setStatus("error");
    }
  }, []);

  return { status, error, subscribe, unsubscribe };
}

function openAll() {
  for (const kw of KEYWORDS) {
    // Nombre de ventana fijo por palabra clave: si Leo aprieta el botón de
    // nuevo más tarde, reusa la misma pestaña en vez de apilar duplicadas.
    window.open(kw.url, `mlwatch-${slugify(kw.label)}`);
  }
}

// Escudo de cada card: un círculo con los colores reales del club +
// iniciales (no el logo oficial, para no reproducir el isotipo del club).
// Las dos palabras clave genéricas ("Camisetas", "Camisetas de futbol")
// usan un ícono en vez de escudo, porque no son de un equipo.
function Crest({ kw }) {
  if (kw.icon) {
    return (
      <span className="link-card-crest link-card-crest-generic" aria-hidden="true">
        {kw.icon}
      </span>
    );
  }
  const [a, b] = kw.colors;
  return (
    <span
      className="link-card-crest"
      aria-hidden="true"
      style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }}
    >
      {kw.initials}
    </span>
  );
}

// Catálogo detectado automáticamente por scripts/scrape.js (vía Apify),
// 3 veces por día. A diferencia de la grilla de abajo (que son links para
// que abras vos), esto ya trae los resultados reales con imagen, precio y
// badge de "NUEVO" cuando algo no estaba en la corrida anterior.
function ScrapedCatalog() {
  const [state, setState] = useState({ status: "loading", searches: [] });

  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data) => setState({ status: "ready", searches: data.searches || [] }))
      .catch(() => setState({ status: "error", searches: [] }));
  }, []);

  if (state.status === "loading") return null;
  if (state.status === "error") return null;

  return (
    <div className="catalog-section">
      {state.searches.map((search) => (
        <div key={search.key} className="catalog-block">
          <div className="catalog-heading">
            <strong>{search.label}</strong>
            <span className="catalog-heading-hint">detectado automático, 3 veces por día</span>
          </div>
          {search.items.length === 0 ? (
            <div className="catalog-empty">
              Todavía no corrió el scraper, o no encontró publicaciones. Volvé a mirar más tarde.
            </div>
          ) : (
            <div className="catalog-grid">
              {search.items.map((item) => (
                <a key={item.id} className="catalog-card" href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.isNew && <span className="catalog-card-badge">NUEVO</span>}
                  {item.image ? (
                    <img className="catalog-card-image" src={item.image} alt={item.title} />
                  ) : (
                    <div className="catalog-card-image catalog-card-image-placeholder">👕</div>
                  )}
                  <div className="catalog-card-body">
                    <div className="catalog-card-title">{item.title}</div>
                    {item.price && <div className="catalog-card-price">{item.price}</div>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { status, error, subscribe, unsubscribe } = useReminderStatus();

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>ML Watch</h1>
          <div className="subtitle">
            Camisetas usadas en Mercado Libre — vos elegís cuándo mirar, en tu propia sesión
          </div>
        </div>
      </div>

      <ScrapedCatalog />

      <div className="open-all">
        <button className="btn-primary btn-big" onClick={openAll}>
          🔍 Abrir las {KEYWORDS.length} búsquedas
        </button>
        <div className="open-all-hint">
          Abre una pestaña nueva por cada palabra clave, ya logueado con tu cuenta — nada de esto
          scrapea ni automatiza Mercado Libre.
        </div>
      </div>

      <div className="reminder">
        <div className="reminder-text">
          <strong>Recordatorio</strong>
          <div className="reminder-sub">
            Notificaciones del navegador: cuando el scraper de Huracán encuentra algo nuevo (hasta
            3 veces por día), y un recordatorio genérico dos veces por día para que vengas a
            revisar las otras búsquedas a mano. No hace falta tener la webapp abierta.
          </div>
        </div>
        {status === "unsupported" && (
          <span className="reminder-hint">Tu navegador no soporta notificaciones push.</span>
        )}
        {(status === "unsubscribed" || status === "error") && (
          <button className="btn-ghost" onClick={subscribe}>
            Activar recordatorio
          </button>
        )}
        {status === "subscribing" && <button className="btn-ghost" disabled>Activando…</button>}
        {status === "subscribed" && (
          <button className="btn-ghost" onClick={unsubscribe}>
            ✓ Activado — desactivar
          </button>
        )}
        {status === "unsubscribing" && <button className="btn-ghost" disabled>Desactivando…</button>}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="grid-links">
        {KEYWORDS.map((kw) => (
          <a
            key={kw.label}
            className="link-card"
            href={kw.url}
            target={`mlwatch-${slugify(kw.label)}`}
            rel="noopener noreferrer"
          >
            <Crest kw={kw} />
            <span className="link-card-label">{kw.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
