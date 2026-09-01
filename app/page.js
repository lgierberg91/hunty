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
            Una notificación del navegador, dos veces por día (~10:00 y ~20:00 ART), para
            acordarte de venir a apretar el botón de arriba. No hace falta tener la webapp
            abierta.
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
            <span className="link-card-label">{kw.label}</span>
            {!kw.verified && <span className="link-card-badge">revisar filtro Usado</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
