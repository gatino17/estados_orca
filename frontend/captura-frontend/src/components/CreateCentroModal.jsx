import { useEffect, useState } from "react";

function slugify(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CreateCentroModal({ open, onClose, base, cliente, onCreated }) {
  const [nombre, setNombre] = useState("");
  const [uuidEquipo, setUuidEquipo] = useState("");
  const [uuidTouched, setUuidTouched] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [grabacion, setGrabacion] = useState("");
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  });

  // ⚠️ Ahora opcional: usar "" para “vacío/no enviar”
  const [dispositivoId, setDispositivoId] = useState("");

  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uuidTouched) setUuidEquipo(slugify(nombre));
  }, [nombre, uuidTouched]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // 1) Crear centro
      const r1 = await fetch(`${base}/api/centros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente.id,
          nombre,
          observacion: observacion || null,
          grabacion: grabacion || null,
          uuid_equipo: uuidEquipo || null,
        }),
      });
      if (!r1.ok) throw new Error((await r1.text()) || `HTTP ${r1.status}`);
      const cen = await r1.json();
      const centroId = cen.id;

      // 2) Crear captura del día
      if (file) {
        // ✅ Con imagen: usa uuid_equipo (no IDs)
        const fd = new FormData();
        fd.append("uuid_equipo", cen.uuid_equipo || uuidEquipo || "");
        fd.append("fecha_reporte", fecha);
        fd.append("origen", "manual");
        fd.append("file", file);

        const r2 = await fetch(`${base}/api/capturas/upload`, { method: "POST", body: fd });
        if (!r2.ok) throw new Error((await r2.text()) || `HTTP ${r2.status}`);
      } else {
        // ✅ Sin imagen: /create con dispositivo_id opcional
        const payload = {
          cliente_id: cliente.id,
          centro_id: centroId,
          fecha_reporte: fecha,
          estado: "pendiente",
        };
        // solo incluir si hay número válido
        const dispNum = dispositivoId === "" ? null : Number(dispositivoId);
        if (Number.isFinite(dispNum)) payload.dispositivo_id = dispNum;

        const r3 = await fetch(`${base}/api/capturas/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r3.ok) throw new Error((await r3.text()) || `HTTP ${r3.status}`);
      }

      onCreated?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5">
        <div className="text-lg font-semibold">Crear centro</div>
        <div className="text-xs text-slate-500">Cliente: {cliente?.nombre || `ID ${cliente?.id}`}</div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-slate-600">Nombre del centro</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          {/* uuid_equipo */}
          <div className="col-span-2">
            <div className="flex items-baseline justify-between">
              <label className="block text-sm text-slate-600">UUID del equipo (agente)</label>
              <span className="text-[11px] text-slate-500">
                Se sugiere un slug del nombre (ej: <code>centro-oficina</code>)
              </span>
            </div>
            <input
              className="w-full border rounded px-3 py-2 font-mono"
              value={uuidEquipo}
              onChange={(e) => { setUuidTouched(true); setUuidEquipo(e.target.value); }}
              placeholder="centro-oficina"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Usa este valor en <code>UUID_EQUIPO</code> del <code>agent.py</code>.
            </p>
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-slate-600">Observación (opcional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="sn"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-slate-600">Grabación (opcional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={grabacion}
              onChange={(e) => setGrabacion(e.target.value)}
              placeholder="correcto"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600">Fecha de reporte</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600">Dispositivo ID (opcional)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2"
              value={dispositivoId}
              onChange={(e) => {
                const v = e.target.value.trim();
                // "" => no enviar; cualquier número válido => enviar
                setDispositivoId(v === "" ? "" : Number(v));
              }}
              placeholder="p.ej. 2 (o deja vacío)"
              min={1}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Si lo dejas vacío, se guardará sin dispositivo y más tarde el agente asignará/recordará el último.
            </p>
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-slate-600">Imagen inicial (opcional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Si subes imagen, se usará <code>uuid_equipo</code> en el upload (sin IDs).
            </p>
          </div>
        </div>

        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !nombre}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Creando…" : "Crear centro"}
          </button>
        </div>
      </form>
    </div>
  );
}
