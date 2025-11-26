// CentrosTable.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import ImageModal from "./ImageModal";
import EditCapturaModal from "./EditCapturaModal";

function Dot({ online }) {
  return (
    <span
      title={online ? "Conectado" : "Desconectado"}
      className={[
        "inline-block w-2.5 h-2.5 rounded-full align-middle",
        online
          ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,.2)] ring-1 ring-emerald-600/50"
          : "bg-slate-300 ring-1 ring-slate-300/60",
      ].join(" ")}
    />
  );
}

function fmtLastSeen(iso) {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

function estadoPillClasses(estadoRaw) {
  const s = String(estadoRaw || "").toLowerCase();
  if (/(ok|exito|éxito|actualizada|actualizado|hecho)/.test(s))
    return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300";
  if (/(pend|esper|proces)/.test(s))
    return "bg-amber-100 text-amber-800 ring-1 ring-amber-300";
  if (/(error|fall|deneg|fail)/.test(s))
    return "bg-rose-100 text-rose-800 ring-1 ring-rose-300";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-300";
}

export default function CentrosTable({
  base,
  rows,
  onRefresh,
  onRefreshRow,
  refreshStatus,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  canDelete = true,
  totalSinImagen = 0,
  missingNamesTotal = [],
}) {
  const [imgOpen, setImgOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState("");
  const [imgTitle, setImgTitle] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [statusById, setStatusById] = useState({});
  const [editRow, setEditRow] = useState(null);
  const startTimesRef = useRef({});
  const [missingImages, setMissingImages] = useState(new Set());

  const safePage = Math.max(1, page || 1);
  const safePageSize = Math.max(1, pageSize || 1);
  const safeTotal = Math.max(0, total || 0);
  const safeTotalPages = Math.max(1, totalPages || 1);
  const startIdx = safeTotal ? (safePage - 1) * safePageSize + 1 : 0;
  const endIdx = safeTotal ? Math.min(startIdx + safePageSize - 1, safeTotal) : 0;
  const viewRows = useMemo(() => rows || [], [rows]);
  const hasStatus = useMemo(() => Object.values(statusById).some(Boolean), [statusById]);
  const missingCount = totalSinImagen || missingImages.size;
  const missingNames = useMemo(() => {
    if (Array.isArray(missingNamesTotal) && missingNamesTotal.length) return missingNamesTotal;
    if (!rows?.length) return [];
    return rows
      .filter((r) => !r?.ultima_imagen_url)
      .map((r) => r.nombre || `Centro ${r.centro_id || r.id}`);
  }, [rows, missingNamesTotal]);

  useEffect(() => {
    const next = new Set();
    (rows || []).forEach((r) => {
      const k = r.id ?? r.centro_id;
      if (!r?.ultima_imagen_url && k !== undefined) next.add(k);
    });
    setMissingImages(next);
  }, [rows]);

  const btn = {
    base: "px-3 py-1.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1",
    sky: "bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-300",
    emerald: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300",
    rose: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300",
    subtle: "bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200",
    disabled: "disabled:opacity-60 disabled:cursor-not-allowed",
  };

  function updateStatus(idOrKey, text) {
    setStatusById((s) => ({ ...s, [idOrKey]: text }));
  }

  function thumb(row) {
    if (!row?.ultima_imagen_url) return "";
    const path = row.ultima_imagen_url.replace("/ultima/image", "/ultima/thumb");
    const versionParam = row.ultima_version_id ? `?max_w=360&v=${row.ultima_version_id}` : "?max_w=360";
    return `${base}${path}${versionParam}`;
  }

  function thumbSrcSet(row) {
    if (!row?.ultima_imagen_url) return undefined;
    const basePath = row.ultima_imagen_url.replace("/ultima/image", "/ultima/thumb");
    const qs = (w) => `?max_w=${w}${row.ultima_version_id ? `&v=${row.ultima_version_id}` : ""}`;
    return [
      `${base}${basePath}${qs(360)} 360w`,
      `${base}${basePath}${qs(540)} 540w`,
      `${base}${basePath}${qs(720)} 720w`,
    ].join(", ");
  }

  async function getEstado(id) {
    try {
      const r = await fetch(`${base}/api/capturas/${id}/estado`, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function optimisticOnlineUpdate(row) {
    setStatusById((s) => ({ ...s, [row.id ?? row.centro_id]: "Agente activo..." }));
    refreshStatus?.();
  }

  async function retomar(row) {
    const rowKey = row.id ?? row.centro_id;
    startTimesRef.current[rowKey] = Date.now();

    if (!row.id) {
      const qs = new URLSearchParams({ fecha: row.fecha_reporte }).toString();
      const res = await fetch(
        `${base}/api/capturas/centro/${row.centro_id}/retomar?${qs}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const elapsed = Math.round((Date.now() - (startTimesRef.current[rowKey] || Date.now())) / 1000);
        updateStatus(row.centro_id, `Error: ${await res.text()} (${elapsed}s)`);
        return;
      }
      const elapsed = Math.round((Date.now() - (startTimesRef.current[rowKey] || Date.now())) / 1000);
      updateStatus(row.centro_id, `Orden enviada (${elapsed}s)`);
      optimisticOnlineUpdate(row);
      onRefreshRow?.(row);
      return;
    }

    setBusyId(row.id);
    updateStatus(row.id, "Solicitando captura...");
    const before = await getEstado(row.id);

    try {
      const qs = new URLSearchParams({ fecha: row.fecha_reporte }).toString();
      const res = await fetch(`${base}/api/capturas/${row.id}/retomar?${qs}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());

      optimisticOnlineUpdate(row);
      updateStatus(row.id, "Capturando en el equipo...");

      const start = Date.now();
      const timer = setInterval(async () => {
        if (Date.now() - start > 60000) {
          clearInterval(timer);
          setBusyId(null);
          const elapsed = Math.round((Date.now() - (startTimesRef.current[rowKey] || start)) / 1000);
          updateStatus(row.id, `Tiempo de espera agotado (${elapsed}s)`);
          return;
        }
        const st = await getEstado(row.id);
        if (st && st.ultima_version_id && (!before || st.ultima_version_id !== before.ultima_version_id)) {
          clearInterval(timer);
          setBusyId(null);
          const elapsed = Math.round((Date.now() - (startTimesRef.current[rowKey] || start)) / 1000);
          updateStatus(row.id, `Actualizada en ${elapsed}s`);
          onRefreshRow?.(row);
        } else {
          /* noop */
        }
      }, 2000);
    } catch (e) {
      setBusyId(null);
      const elapsed = Math.round((Date.now() - (startTimesRef.current[rowKey] || Date.now())) / 1000);
      updateStatus(row.id, `Error: ${e.message} (${elapsed}s)`);
    }
  }

  async function eliminarCentro(centroId) {
    if (!centroId) return;
    if (!confirm(`Eliminar el centro #${centroId}? Esto borra todas sus capturas e imagenes.`)) return;
    try {
      const r = await fetch(`${base}/api/centros/${centroId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      onRefresh?.();
    } catch (e) {
      alert("Error al eliminar centro: " + e.message);
    }
  }

  function openImage(row) {
    const full = row?.ultima_imagen_url
      ? `${base}${row.ultima_imagen_url}${row.ultima_version_id ? `?v=${row.ultima_version_id}` : ""}`
      : thumb(row);
    if (!full) return;
    setImgSrc(full);
    setImgTitle(row.nombre || `Centro ${row.centro_id}`);
    setImgOpen(true);
  }

  function onSaved() {
    (onRefreshRow ? onRefreshRow(editRow) : onRefresh?.());
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
        {/* Toolbar de paginacion */}
        <div className="px-3 md:px-4 py-3 flex flex-wrap items-center gap-3 border-b bg-slate-50/60">
          <div className="text-sm text-slate-700">
            Mostrando <b>{safeTotal ? startIdx : 0}</b> - <b>{endIdx}</b> de <b>{safeTotal}</b>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-slate-600">Filas por pagina</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10) || 10)}
              className="border rounded px-2 py-1 text-sm"
            >
              {[10, 15, 30, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange?.(1)}
                disabled={safePage <= 1}
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                title="Primera"
              >{"<<"}</button>
              <button
                onClick={() => onPageChange?.(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                title="Anterior"
              >{"<"}</button>
              <span className="text-xs text-slate-600 px-2">{safePage} / {safeTotalPages}</span>
              <button
                onClick={() => onPageChange?.(Math.min(safeTotalPages, safePage + 1))}
                disabled={safePage >= safeTotalPages}
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                title="Siguiente"
              >{">"}</button>
              <button
                onClick={() => onPageChange?.(safeTotalPages)}
                disabled={safePage >= safeTotalPages}
                className="px-2 py-1 rounded border text-sm disabled:opacity-50"
                title="Ultima"
              >{">>"}</button>
            </div>
            {missingCount > 0 && (
              <div className="flex items-center gap-2 rounded-full px-3 py-2 text-xs text-rose-800 font-semibold bg-gradient-to-r from-rose-50 via-rose-100 to-orange-50 ring-1 ring-rose-200 shadow-sm">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-200 text-rose-800 text-[10px]">
                  !
                </span>
                <div className="flex flex-col">
                  <span className="uppercase tracking-wide text-[11px]">Sin imagen: {missingCount}</span>
                  <span className="text-[11px] font-semibold text-rose-900 line-clamp-2">
                    {missingNames.slice(0, 6).join(", ")}
                    {missingNames.length > 6 ? "…" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <table className="min-w-full text-sm">
          <thead className="text-slate-700 text-[12px] uppercase tracking-wide">
            <tr className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur supports-[backdrop-filter]:bg-slate-50/60">
              <th className="px-3 md:px-4 py-3 text-left">Centro</th>
              <th className="px-3 md:px-4 py-3 text-left hidden sm:table-cell">Agente</th>
              <th className="px-3 md:px-4 py-3 text-left hidden sm:table-cell">Estado</th>
              <th className="px-3 md:px-4 py-3 text-left hidden md:table-cell">Fecha reporte</th>
              <th className="px-3 md:px-4 py-3 text-left">Imagen</th>
              <th className="px-3 md:px-4 py-3 text-left">Acciones</th>
              {hasStatus && <th className="px-3 md:px-4 py-3 text-left">Resultado</th>}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {viewRows.map((row) => {
              const key = row.id ?? `centro-${row.centro_id}`;
              const estadoCls = estadoPillClasses(row.estado);

              return (
                <tr
                  key={key}
                  className="odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60 transition-colors"
                >
                  <td className="px-3 md:px-4 py-3 align-top">
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      <Dot online={row.online} />
                      <span title={row.online ? "Conectado" : "Desconectado"}>
                        {row.nombre || `Centro ${row.centro_id}`}
                      </span>
                    </div>

                    {(row.observacion || row.grabacion) && (
                      <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                        {row.observacion && (
                          <div>
                            <b>Obs:</b> {row.observacion}
                          </div>
                        )}
                        {row.grabacion && (
                          <div>
                            <b>Grab:</b> {row.grabacion}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-3 md:px-4 py-3 align-top hidden sm:table-cell">
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <div className="font-mono">{row.uuid_equipo || "--"}</div>
                      <div className="text-[11px] text-slate-500">Centro ID: {row.centro_id}</div>
                      <div className="text-[11px] text-slate-500">
                        last_seen: {fmtLastSeen(row.last_seen)}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 md:px-4 py-3 align-top hidden sm:table-cell">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${estadoCls}`}>
                      {row.estado}
                    </span>
                  </td>

                  <td className="px-3 md:px-4 py-3 align-top font-mono hidden md:table-cell">
                    {row.fecha_reporte}
                  </td>

                  <td className="px-3 md:px-4 py-3 align-top">
                    {row.ultima_imagen_url ? (
                      <img
                        src={thumb(row)}
                        srcSet={thumbSrcSet(row)}
                        sizes="176px"
                        loading="lazy"
                        decoding="async"
                        fetchpriority="low"
                        className="w-44 h-28 object-cover rounded-lg ring-1 ring-slate-200 hover:shadow-md cursor-zoom-in transition"
                        onClick={() => openImage(row)}
                        alt=""
                        onLoad={() => setMissingImages((prev) => {
                          const next = new Set(prev);
                          next.delete(row.id ?? row.centro_id);
                          return next;
                        })}
                      />
                    ) : (
                      <div className="text-xs text-slate-500">Sin imagen</div>
                    )}
                  </td>

                  <td className="px-3 md:px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => retomar(row)}
                        disabled={row.id ? busyId === row.id : false}
                        className={[
                          btn.base,
                          btn.sky,
                          btn.disabled,
                          "flex items-center gap-2",
                          row.id && busyId === row.id ? "cursor-wait" : "",
                        ].join(" ")}
                        title="Solicitar nueva captura"
                        aria-label="Solicitar nueva captura"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="7" width="18" height="14" rx="2" ry="2" />
                          <path d="M7 7l2-3h6l2 3" />
                          <circle cx="12" cy="14" r="3" />
                        </svg>
                        <span className="text-sm">{row.id && busyId === row.id ? "Capturando..." : ""}</span>
                      </button>

                      {row.id && (
                        <button
                          onClick={() => setEditRow(row)}
                          className={[btn.base, btn.emerald, "flex items-center gap-2"].join(" ")}
                          title="Editar metadatos"
                          aria-label="Editar metadatos"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                      </button>
                      )}

                      {row.id && canDelete && (
                        <button
                          onClick={() => eliminarCentro(row.centro_id)}
                          className={[
                            btn.base,
                            btn.rose,
                            "p-2 flex items-center justify-center gap-2"
                          ].join(" ")}
                          title="Eliminar centro"
                          aria-label={`Eliminar ${row.nombre || `centro ${row.centro_id}`}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v2" />
                          </svg>
                          <span className="sr-only">Eliminar</span>
                        </button>
                      )}

                    </div>
                  </td>

                  {hasStatus && (
                    <td className="px-3 md:px-4 py-3 align-top text-[12px] text-slate-600">
                      {statusById[row.id ?? row.centro_id] || ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ImageModal
        open={imgOpen}
        src={imgSrc}
        onClose={() => setImgOpen(false)}
        title={imgTitle}
      />

      <EditCapturaModal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        base={base}
        row={editRow}
        onSaved={onSaved}
      />
    </>
  );
}
