"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_KEYWORDS = [
  "Camisetas de futbol",
  "Camisetas",
  "Boca",
  "River",
  "Huracan",
  "Racing",
  "Argentina",
  "Independiente",
  "San Lorenzo",
  "Velez",
];

const KEYWORDS_STORAGE_KEY = "ml-watch:keywords";
const SEEN_STORAGE_KEY = "ml-watch:seen";
const MAX_SEEN_PER_KEYWORD = 400;

function loadKeywords() {
  try {
    const raw = localStorage.getItem(KEYWORDS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_KEYWORDS;
}

function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function formatPrice(price, currency) {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "ARS",
      maximumFractionDigits: 0,
    }).format(price);
  } catch (e) {
    return `${currency} ${price}`;
  }
}

export default function Home() {
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [newKeyword, setNewKeyword] = useState("");
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    setKeywords(loadKeywords());
  }, []);

  const totalNew = useMemo(() => {
    return Object.values(data).reduce(
      (acc, items) => acc + items.filter((i) => i.isNew).length,
      0
    );
  }, [data]);

  async function refresh(currentKeywords) {
    const list = currentKeywords || keywords;
    if (list.length === 0) return;
    setLoading(true);
    setAuthUrl(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(list.join(","))}`);
      const json = await res.json();

      if (res.status === 401 && json.authUrl) {
        setAuthUrl(json.authUrl);
        setLoading(false);
        return;
      }

      if (!json.ok) {
        setLoading(false);
        return;
      }

      const seen = loadSeen();
      const nextSeen = { ...seen };
      const withNewFlag = {};

      for (const keyword of list) {
        const items = json.results[keyword] || [];
        const seenIds = new Set(seen[keyword] || []);
        withNewFlag[keyword] = items.map((item) => ({
          ...item,
          isNew: !seenIds.has(item.id),
        }));
        const mergedIds = [...new Set([...items.map((i) => i.id), ...(seen[keyword] || [])])];
        nextSeen[keyword] = mergedIds.slice(0, MAX_SEEN_PER_KEYWORD);
      }

      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(nextSeen));
      setData(withNewFlag);
      setErrors(json.errors || {});
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (keywords.length > 0) refresh(keywords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords.length === DEFAULT_KEYWORDS.length ? "init" : "changed"]);

  function persistKeywords(list) {
    setKeywords(list);
    localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(list));
    refresh(list);
  }

  function addKeyword() {
    const value = newKeyword.trim();
    if (!value || keywords.includes(value)) return;
    persistKeywords([...keywords, value]);
    setNewKeyword("");
  }

  function removeKeyword(kw) {
    persistKeywords(keywords.filter((k) => k !== kw));
  }

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>ML Watch</h1>
          <div className="subtitle">
            {lastUpdated
              ? `Actualizado ${lastUpdated.toLocaleTimeString("es-AR")}`
              : "Publicaciones de Mercado Libre por palabra clave"}
            {totalNew > 0 && ` · ${totalNew} nuevas`}
          </div>
        </div>
        <button className="btn-primary" onClick={() => refresh()} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {authUrl && (
        <div className="auth-box">
          Todavía no autorizaste esta app contra tu cuenta de Mercado Libre.{" "}
          <a href={authUrl} className="btn-primary" style={{ textDecoration: "none", padding: "6px 12px", borderRadius: 6 }}>
            Autorizar ahora
          </a>
        </div>
      )}

      <div className="keyword-bar">
        {keywords.map((kw) => (
          <div className="chip" key={kw}>
            {kw}
            <button onClick={() => removeKeyword(kw)} title="Quitar">
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="add-keyword">
        <input
          placeholder="Agregar palabra clave (ej: camiseta racing 2026)"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addKeyword()}
        />
        <button className="btn-ghost" onClick={addKeyword}>
          Agregar
        </button>
      </div>

      {keywords.map((keyword) => {
        const items = data[keyword];
        const error = errors[keyword];
        return (
          <div className="group" key={keyword}>
            <h2>
              {keyword}
              {items && <span className="count">({items.length})</span>}
            </h2>
            {error && <div className="error">Error: {error}</div>}
            {!error && !items && loading && <div className="loading">Buscando…</div>}
            {!error && items && items.length === 0 && (
              <div className="empty">Sin resultados.</div>
            )}
            {items && items.length > 0 && (
              <div className="grid">
                {items.map((item) => (
                  <a
                    key={item.id}
                    className="card"
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.isNew && <span className="badge-new">NUEVO</span>}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbnail} alt={item.title} loading="lazy" />
                    <div className="card-body">
                      <div className="card-title">{item.title}</div>
                      <div className="card-price">{formatPrice(item.price, item.currency)}</div>
                      <div className="card-meta">
                        {item.condition === "new" ? "Nuevo" : "Usado"}
                        {item.freeShipping ? " · Envío gratis" : ""}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
