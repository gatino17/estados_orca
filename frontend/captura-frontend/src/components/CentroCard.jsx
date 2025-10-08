import { useState } from "react";
import ImageModal from "./ImageModal";

export default function CentroCard({ base, row, selectedFecha }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [imgKey, setImgKey] = useState(Date.now());

  const hasImage = !!row.ultima_imagen_url;
  const thumb = hasImage ? `${base}${row.ultima_imagen_url}?t=${imgKey}` : null;
  const large = thumb;

  async function getEstado(capturaId) {
    if (!capturaId) return null;
    try {
      const r = await fetch(`${base}/api/capturas/${capturaId}/estado`, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json(); // { ultima_version_id, tomada_en }
    } catch {
      return null;
    }
  }

  async function retomar() {
    setBusy(true);
    setStatus("Solicitando captura…");

    let capturaId = row.id || null;
    let before = null;
    if (capturaId) {
      before = await getEstado(capturaId);
    }

    try {
      // arma URL según exista o no la captura para la fecha
      const q = new URLSearchParams();
      if (selectedFecha || row.fecha_reporte) {
        q.set("fecha", selectedFecha || row.fecha_reporte);
      }

      let url;
      if (capturaId) {
        url = `${base}/api/capturas/${capturaId}/retomar${q.toString() ? `?${q.toString()}` : ""}`;
      } else {
        url = `${base}/api/capturas/centro/${row.centro_id}/retomar${q.toString() ? `?${q.toString()}` : ""}`;
      }

      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.captura_id && data.captura_id !== capturaId) {
        capturaId = data.captura_id; // usar nueva captura creada
      }

      setStatus("Capturando en el equipo…");

      const start = Date.now();
      const iv = setInterval(async () => {
        if (Date.now() - start > 60000) {
          clearInterval(iv);
          setBusy(false);
          setStatus("Tiempo de espera agotado");
          return;
        }

        const st = await getEstado(capturaId);
        if (st && st.ultima_version_id && (!before || st.ultima_version_id !== before.ultima_version_id)) {
          clearInterval(iv);
          setBusy(false);
          setStatus("¡Actualizada!");
          setImgKey(Date.now()); // cache-busting
          return;
        }
        // refresco suave
        setImgKey(Date.now());
      }, 2000);
    } catch (e) {
      setBusy(false);
      setStatus(`Error: ${e.message}`);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow border">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3
            className="font-semibold text-slate-800 truncate"
            title={row.nombre || `Centro ${row.centro_id}`}
          >
            {row.nombre || `Centro ${row.centro_id}`}
          </h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {row.estado}
          </span>
        </div>

        {/* Miniatura / placeholder */}
        <div className="mt-3">
          {hasImage ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={thumb}
              className="w-full h-36 object-cover rounded-lg border cursor-zoom-in"
              onClick={() => setOpen(true)}
            />
          ) : (
            <div className="w-full h-36 rounded-lg border bg-slate-100 grid place-items-center text-slate-500 text-sm">
              Sin imagen
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-1">
            Fecha reporte: <span className="font-mono">{row.fecha_reporte}</span>
          </div>
        </div>

        {(row.observacion || row.grabacion) && (
          <div className="mt-2 text-xs text-slate-600 space-y-1">
            {row.observacion && (
              <p>
                <b>Obs:</b> {row.observacion}
              </p>
            )}
            {row.grabacion && (
              <p>
                <b>Grab:</b> {row.grabacion}
              </p>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={retomar}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? "Capturando…" : "Actualizar imagen"}
          </button>
          <div className="text-[11px] text-slate-500 h-5 flex items-center">
            {status}
          </div>
        </div>
      </div>

      {/* Modal imagen grande, solo si hay imagen */}
      {hasImage && (
        <ImageModal
          open={open}
          src={large}
          onClose={() => setOpen(false)}
          title={row.nombre || `Centro ${row.centro_id}`}
        />
      )}
    </div>
  );
}
