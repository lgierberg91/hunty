"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

const HOUR_OPTIONS = [2, 6, 24, 48];
const DEFAULT_HOURS = 24;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 min — solo relee la cache en Redis, no scrapea de nuevo
const NEW_BADGE_WINDOW_MS = 90 * 60 * 1000; // marca "NUEVO" lo visto en la última hora y media

function formatPrice(price, currency) {
  if (price === null || price === undefined) return "Consultar precio";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "ARS",
      maximumFractionDigits: 0,
    }).format(price);
  } catch (e) {
    return `${currency ?? ""} ${price}`;
  }
}

function formatRelative(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 48) return `hace ${hs} h`;
  const days = Math.round(hs / 24);
  return `hace ${days} d`;
}

export default function Home() {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [keywords, setKeywords] = useState([]);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [lastScraped, setLastScraped] = useState(null);
  const [lastErrors, setLastErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState(null);

  const refresh = useCallback(async (h) => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const res = await fetch(`/api/search?hours=${h}`);
      const json = await res.json();
      if (!json.ok) {
        setFetchFailed(true);
        return;
      }
      setKeywords(json.keywords || []);
      setData(json.results || {});
      setErrors(json.errors || {});
      setLastScraped(json.lastScraped || null);
      setLastErrors(json.lastErrors || {});
    } catch (e) {
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(hours);
  }, [hours, refresh]);

  // Relee cada 5 minutos por si el scraper corrió entre medio — es solo una
  // lectura a Redis, así que no tiene costo pegarle seguido.
  useEffect(() => {
    const id = setInterval(() => refresh(hours), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [hours, refresh]);

  async function triggerScrape() {
    setTriggering(true);
    setTriggerMessage(null);
    try {
      const res = await fetch("/api/trigger-scrape", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setTriggerMessage(
          "Rastreo disparado. Tarda uno o dos minutos en aparecer acá — apretá \"Actualizar\" en un rato."
        );
      } else {
        setTriggerMessage(json.error || "No se pudo disparar el rastreo.");
      }
    } catch (e) {
      setTriggerMessage("No se pudo disparar el rastreo (error de red).");
    } finally {
      setTriggering(false);
    }
  }

  const totalItems = useMemo(
    () => Object.values(data).reduce((acc, items) => acc + items.length, 0),
    [data]
  );

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>ML Watch</h1>
          <div className="subtitle">
            {lastScraped
              ? `Último rastreo: ${formatRelative(new Date(lastScraped).getTime())}`
              : "Publicaciones usadas de Mercado Libre por palabra clave"}
            {totalItems > 0 && ` · ${totalItems} publicaciones`}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-ghost" onClick={triggerScrape} disabled={triggering}>
            {triggering ? "Disparando…" : "Rastrear ahora"}
          </button>
          <button className="btn-primary" onClick={() => refresh(hours)} disabled={loading}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </div>

      {triggerMessage && <div className="trigger-note">{triggerMessage}</div>}

      {keywords.length > 0 && (
        <div className="status-strip">
          {keywords.map((kw) => {
            const hasError = !!lastErrors[kw];
            return (
              <span
                key={kw}
                className={hasError ? "status-dot status-dot-error" : "status-dot status-dot-ok"}
                title={hasError ? lastErrors[kw] : "Último rastreo OK"}
              >
                {kw}
              </span>
            );
          })}
        </div>
      )}

      <div className="hours-bar">
        {HOUR_OPTIONS.map((h) => (
          <button
            key={h}
            className={h === hours ? "chip chip-active" : "chip"}
            onClick={() => setHours(h)}
          >
            Últimas {h} hs
          </button>
        ))}
      </div>

      {fetchFailed && (
        <div className="error" style={{ marginBottom: 20 }}>
          No se pudo leer la información. Probá actualizar de nuevo en un rato.
        </div>
      )}

      {!fetchFailed && !loading && keywords.length === 0 && (
        <div className="empty">
          Todavía no hay datos. Probá el botón &quot;Rastrear ahora&quot; de arriba, o
          esperá al próximo ciclo programado.
        </div>
      )}

      {keywords.map((keyword) => {
        const items = data[keyword];
        const error = errors[keyword];
        const scrapeError = lastErrors[keyword];
        return (
          <div className="group" key={keyword}>
            <h2>
              {keyword}
              {items && <span className="count">({items.length})</span>}
            </h2>
            {error && <div className="error">Error leyendo datos: {error}</div>}
            {!error && scrapeError && (
              <div className="error">
                El último rastreo de &quot;{keyword}&quot; falló: {scrapeError}. Mostrando lo
                último que se guardó con éxito.
              </div>
            )}
            {!error && items && items.length === 0 && (
              <div className="empty">Sin publicaciones en esta ventana de tiempo.</div>
            )}
            {items && items.length > 0 && (
              <div className="grid">
                {items.map((item) => {
                  const isNew = Date.now() - item.firstSeenAt < NEW_BADGE_WINDOW_MS;
                  return (
                    <a
                      key={item.id}
                      className="card"
                      href={item.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {isNew && <span className="badge-new">NUEVO</span>}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumbnail} alt={item.title} loading="lazy" />
                      <div className="card-body">
                        <div className="card-title">{item.title}</div>
                        <div className="card-price">{formatPrice(item.price, item.currency)}</div>
                        <div className="card-meta">{formatRelative(item.firstSeenAt)}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
