import { useEffect, useState } from "react";

export default function EditCapturaModal({ open, onClose, base, row, onSaved }) {
  const [fecha, setFecha] = useState(row?.fecha_reporte || "");
  const [estado, setEstado] = useState(row?.estado || "pendiente");
  const [observacion, setObservacion] = useState(row?.observacion || "");
  const [grabacion, setGrabacion] = useState(row?.grabacion || "");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setFecha(row?.fecha_reporte || "");
      setEstado(row?.estado || "pendiente");
      setObservacion(row?.observacion || "");
      setGrabacion(row?.grabacion || "");
      setFile(null);
      setError("");
    }
  }, [open, row]);

  async function save() {
    if (!row?.id) return; // seguridad: sólo edita si hay captura

    setSaving(true);
    setError("");
    try {
      // 1) PATCH de la captura
      {
        const r = await fetch(`${base}/api/capturas/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha_reporte: fecha || null,
            estado,
            observacion,
            grabacion,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
      }

      // 2) Si hay archivo, subimos nueva versión
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("origen", "manual");
        const r2 = await fetch(`${base}/api/capturas/${row.id}/version`, {
          method: "POST",
          body: fd,
        });
        if (!r2.ok) throw new Error(await r2.text());
      }

      onSaved?.(); // pedimos al padre refrescar
      onClose();
    } catch (e) {
      setError(e.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Editar captura #{row?.id}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-red-600">{error}</div>}

          <div>
            <label className="block text-sm text-slate-600 mb-1">Fecha reporte</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm w-full"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Estado</label>
            <select
              className="border rounded px-3 py-2 text-sm w-full"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="pendiente">pendiente</option>
              <option value="ok">ok</option>
              <option value="rechazada">rechazada</option>
              <option value="sin_reporte">sin_reporte</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Observación</label>
            <textarea
              className="border rounded px-3 py-2 text-sm w-full"
              rows={3}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas de la captura…"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Grabación</label>
            <textarea
              className="border rounded px-3 py-2 text-sm w-full"
              rows={3}
              value={grabacion}
              onChange={(e) => setGrabacion(e.target.value)}
              placeholder="Información extra (ruta de video, etc.)"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Nueva imagen (opcional)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border hover:bg-slate-50">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
