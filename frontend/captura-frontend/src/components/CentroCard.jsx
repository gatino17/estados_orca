import { useEffect, useState } from "react";
import ImageModal from "./ImageModal";

export default function CentroCard({ base, row, selectedFecha }) {
  const [currentRow, setCurrentRow] = useState(row);
  const [busy, setBusy] = useState(false);
  const [rebootBusy, setRebootBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [imgKey, setImgKey] = useState(Date.now());

  useEffect(() => {
    setCurrentRow(row);
  }, [row]);

  const hasImage = !!currentRow.ultima_imagen_url;
  const basePath = hasImage ? currentRow.ultima_imagen_url.replace("/ultima/image", "/ultima/thumb") : null;
  const thumb = hasImage ? `${base}${basePath}?max_w=640&t=${imgKey}` : null;
  const large = hasImage ? `${base}${currentRow.ultima_imagen_url}?t=${imgKey}` : null;

  function thumbSrcSet() {
    if (!hasImage) return undefined;
    const qs = (w) => `?max_w=${w}&t=${imgKey}`;
    return [
      `${base}${basePath}${qs(480)} 480w`,
      `${base}${basePath}${qs(640)} 640w`,
      `${base}${basePath}${qs(720)} 720w`,
    ].join(", ");
  }

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

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchLatestRow() {
    if (!currentRow?.cliente_id || !currentRow?.centro_id) return null;
    const q = new URLSearchParams();
    q.set("cliente_id", String(currentRow.cliente_id));
    q.set("centro_id", String(currentRow.centro_id));
    if (selectedFecha || currentRow.fecha_reporte) {
      q.set("fecha", selectedFecha || currentRow.fecha_reporte);
    }
    q.set("page", "1");
    q.set("page_size", "1");

    const response = await fetch(`${base}/api/capturas?${q.toString()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const updated = Array.isArray(data?.items) && data.items.length ? data.items[0] : null;
    if (updated) {
      setCurrentRow(updated);
      setImgKey(Date.now());
    }
    return updated;
  }

  async function getCentroStatus() {
    if (!currentRow?.cliente_id || !currentRow?.centro_id) return null;
    const q = new URLSearchParams();
    q.set("cliente_id", String(currentRow.cliente_id));
    q.set("threshold_sec", "20");
    q.set("_ts", String(Date.now()));

    const response = await fetch(`${base}/api/centros/status?${q.toString()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.items || []).find((item) => item.id === currentRow.centro_id) || null;
  }

  async function waitForPcBack(commandAtMs, timeoutMs = 300000) {
    const started = Date.now();
    const minReturnAt = commandAtMs + 20000;
    let sawOffline = false;
    while (Date.now() - started < timeoutMs) {
      await delay(3000);
      const state = await getCentroStatus();
      const lastSeenMs = state?.last_seen ? Date.parse(state.last_seen) : 0;
      if (state && !state.online && Date.now() > commandAtMs + 15000) {
        sawOffline = true;
      }
      if (sawOffline && state?.online && lastSeenMs > minReturnAt) {
        return state;
      }
    }
    return null;
  }

  async function retomar(options = {}) {
    setBusy(true);
    if (!options.keepStatus) setStatus("Solicitando captura...");

    let capturaId = currentRow.id || null;
    let before = null;
    if (capturaId) {
      before = await getEstado(capturaId);
    }

    try {
      const q = new URLSearchParams();
      if (selectedFecha || currentRow.fecha_reporte) {
        q.set("fecha", selectedFecha || currentRow.fecha_reporte);
      }

      const url = capturaId
        ? `${base}/api/capturas/${capturaId}/retomar${q.toString() ? `?${q.toString()}` : ""}`
        : `${base}/api/capturas/centro/${currentRow.centro_id}/retomar${q.toString() ? `?${q.toString()}` : ""}`;

      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.captura_id && data.captura_id !== capturaId) {
        capturaId = data.captura_id;
      }

      setStatus("Capturando en el equipo...");

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
          setStatus("Actualizada!");
          await fetchLatestRow();
          setImgKey(Date.now());
          return;
        }
        setImgKey(Date.now());
      }, 2000);
    } catch (e) {
      setBusy(false);
      setStatus(`Error: ${e.message}`);
    }
  }

  async function reiniciarPc() {
    if (!currentRow?.centro_id) return;
    const ok = window.confirm(`Reiniciar el PC de "${currentRow.nombre || `Centro ${currentRow.centro_id}`}"?`);
    if (!ok) return;

    setRebootBusy(true);
    setStatus("Enviando reinicio de PC...");

    try {
      const q = new URLSearchParams();
      if (selectedFecha || currentRow.fecha_reporte) {
        q.set("fecha", selectedFecha || currentRow.fecha_reporte);
      }
      const response = await fetch(
        `${base}/api/ordenes/centro/${currentRow.centro_id}/reiniciar-pc${q.toString() ? `?${q.toString()}` : ""}`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json().catch(() => ({}));
      const commandAtMs = data?.created_at ? Date.parse(data.created_at) : Date.now();
      setStatus("Reinicio enviado. Esperando que el PC vuelva...");

      const back = await waitForPcBack(commandAtMs);
      if (!back) {
        setStatus("Reinicio enviado. Aun sin confirmacion del PC.");
        return;
      }

      setStatus("PC volvio bien. Actualizando imagen...");
      await retomar({ keepStatus: true });
    } catch (e) {
      setStatus(`Error reinicio PC: ${e.message}`);
    } finally {
      setRebootBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow border">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3
            className="font-semibold text-slate-800 truncate"
            title={currentRow.nombre || `Centro ${currentRow.centro_id}`}
          >
            {currentRow.nombre || `Centro ${currentRow.centro_id}`}
          </h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {currentRow.estado}
          </span>
        </div>

        {/* Miniatura / placeholder */}
        <div className="mt-3">
          {hasImage ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={thumb}
              srcSet={thumbSrcSet()}
              sizes="(min-width:1024px) 320px, (min-width:640px) 320px, 100vw"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              className="w-full h-36 object-cover rounded-lg border cursor-zoom-in"
              onClick={() => setOpen(true)}
            />
          ) : (
            <div className="w-full h-36 rounded-lg bg-gradient-to-br from-rose-500 via-red-400 to-orange-300 p-[2px] shadow-sm">
              <div className="h-full w-full rounded-[7px] bg-rose-50 grid place-items-center text-sm font-semibold text-rose-700">
                Sin imagen
              </div>
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-1">
            Fecha reporte: <span className="font-mono">{currentRow.fecha_reporte}</span>
          </div>
        </div>

        {(currentRow.observacion || currentRow.grabacion) && (
          <div className="mt-2 text-xs text-slate-600 space-y-1">
            {currentRow.observacion && (
              <p>
                <b>Obs:</b> {currentRow.observacion}
              </p>
            )}
            {currentRow.grabacion && (
              <p>
                <b>Grab:</b> {currentRow.grabacion}
              </p>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={retomar}
            disabled={busy || rebootBusy}
            className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? "Capturando…" : "Actualizar imagen"}
          </button>
          <button
            onClick={reiniciarPc}
            disabled={busy || rebootBusy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {rebootBusy ? (
              <span className="inline-block h-4 w-4 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            )}
            {rebootBusy ? "Reiniciando..." : "Reiniciar PC"}
          </button>
          <div className="min-h-5 min-w-[180px] flex-1 text-[11px] text-slate-500 flex items-center">
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
          title={currentRow.nombre || `Centro ${currentRow.centro_id}`}
        />
      )}
    </div>
  );
}
