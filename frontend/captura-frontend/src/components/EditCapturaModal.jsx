import { useEffect, useState } from "react";

export default function EditCapturaModal({ open, onClose, base, row, onSaved }) {
  const [fecha, setFecha] = useState(row?.fecha_reporte || "");
  const [estado, setEstado] = useState(row?.estado || "pendiente");
  const [observacion, setObservacion] = useState(row?.observacion || "");
  const [grabacion, setGrabacion] = useState(row?.grabacion || "");
  const [observacionPreset, setObservacionPreset] = useState("custom");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const OBS_PRESETS = [
    { value: "sin_conexion", label: "Sin conexion con el centro al momento de la revision.", text: "Sin conexion con el centro al momento de la revision." },
    { value: "observacion", label: "Centro en observacion.", text: "Centro en observacion." },
    { value: "tecnico", label: "Gestionando tecnico en terreno.", text: "Gestionando tecnico en terreno." },
    { value: "custom", label: "Personalizada", text: "" },
  ];

  useEffect(() => {
    if (open) {
      setFecha(row?.fecha_reporte || "");
      setEstado(row?.estado || "pendiente");
      setObservacion(row?.observacion || "");
      setGrabacion(row?.grabacion || "");
      const presetMatch = OBS_PRESETS.find((p) => p.text && p.text === (row?.observacion || ""));
      setObservacionPreset(presetMatch ? presetMatch.value : "custom");
      setFile(null);
      setPreviewUrl(null);
      setError("");
    }
  }, [open, row]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function save() {
    if (!row?.id) return; // solo edita si hay captura

    setSaving(true);
    setError("");
    try {
      // 1) PATCH de la captura
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

      // 2) Si hay archivo, subimos nueva version
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

      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const currentImg = row?.ultima_imagen_url ? `${base}${row.ultima_imagen_url}` : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Editar captura #{row?.id}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-lg leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-sm text-rose-600">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700 space-y-1">
              <span>Fecha reporte</span>
              <input
                type="date"
                className="border rounded px-3 py-2 text-sm w-full"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>

            <label className="block text-sm text-slate-700 space-y-1">
              <span>Estado</span>
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
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Observacion</label>
            <select
              className="border rounded px-3 py-2 text-sm w-full mb-2"
              value={observacionPreset}
              onChange={(e) => {
                const next = e.target.value;
                setObservacionPreset(next);
                const preset = OBS_PRESETS.find((p) => p.value === next);
                if (preset && preset.text) {
                  setObservacion(preset.text);
                } else {
                  setObservacion("");
                }
              }}
            >
              {OBS_PRESETS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <textarea
              className="border rounded px-3 py-2 text-sm w-full"
              rows={3}
              value={observacion}
              onChange={(e) => {
                setObservacion(e.target.value);
                setObservacionPreset("custom");
              }}
              placeholder="Notas de la captura."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700 mb-1">Grabacion</label>
            <textarea
              className="border rounded px-3 py-2 text-sm w-full"
              rows={3}
              value={grabacion}
              onChange={(e) => setGrabacion(e.target.value)}
              placeholder="Informacion extra (ruta de video, etc.)"
            />
          </div>

          <div className="grid gap-3">
            <div>
              <label className="block text-sm text-slate-700 mb-2">Imagen actual</label>
              {currentImg ? (
                <img
                  src={currentImg}
                  alt=""
                  className="w-full h-40 object-cover rounded-lg ring-1 ring-slate-200"
                  loading="lazy"
                />
              ) : (
                <div className="text-xs text-slate-500">Sin imagen</div>
              )}
            </div>

            <div>
              <label className="block text-sm text-slate-700 mb-2">Nueva imagen (opcional)</label>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="w-6 h-6 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                <span className="text-xs text-slate-600 text-center">
                  Haz clic para seleccionar una imagen
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
              {(previewUrl || file) && (
                <div className="mt-2">
                  <div className="text-xs text-slate-600 mb-1">{file?.name || "Imagen seleccionada"}</div>
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full h-32 object-cover rounded-md ring-1 ring-slate-200"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border hover:bg-slate-50">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
