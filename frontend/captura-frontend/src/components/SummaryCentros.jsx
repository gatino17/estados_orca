import { useCallback, useEffect, useState } from "react";

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => (p?.[0] || "").toUpperCase()).join("") || "CL";
}

export default function SummaryCentros({ base, onChanged, canDelete = true }) {
  const [data, setData] = useState({ items: [], total_clientes: 0, total_centros: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [modalNombre, setModalNombre] = useState("");
  const [modalCliente, setModalCliente] = useState(null);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${base}/api/metrics/centros-por-cliente`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el resumen";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setModalCliente(null);
    setModalNombre("");
    setModalError("");
  };

  const openCreateModal = () => {
    setModalMode("create");
    setModalNombre("");
    setModalCliente(null);
    setModalError("");
    setModalOpen(true);
  };

  const openEditModal = (cliente) => {
    setModalMode("edit");
    setModalNombre(cliente.cliente_nombre || "");
    setModalCliente(cliente);
    setModalError("");
    setModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nombre = modalNombre.trim();
    if (!nombre) {
      setModalError("Ingresa un nombre de cliente.");
      return;
    }

    setSaving(true);
    try {
      if (modalMode === "create") {
        const res = await fetch(`${base}/api/clientes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        });
        if (!res.ok) throw new Error(await res.text() || "No se pudo crear el cliente.");
      } else if (modalCliente) {
        const res = await fetch(`${base}/api/clientes/${modalCliente.cliente_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        });
        if (!res.ok) throw new Error(await res.text() || "No se pudo editar el cliente.");
      }
      await loadData();
      if (onChanged) {
        await onChanged();
      }
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el cliente.";
      setModalError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cliente) => {
    if (!cliente) return;
    const ok = window.confirm(
      `Eliminar el cliente "${cliente.cliente_nombre}"? Esta accion es permanente.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`${base}/api/clientes/${cliente.cliente_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text() || "No se pudo eliminar el cliente.");
      await loadData();
      if (onChanged) {
        await onChanged();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar el cliente.";
      setError(message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white shadow ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-500">Total clientes</div>
          <div className="text-2xl font-semibold text-slate-900">{data.total_clientes}</div>
        </div>
        <div className="rounded-2xl bg-white shadow ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-500">Total centros</div>
          <div className="text-2xl font-semibold text-slate-900">{data.total_centros}</div>
        </div>
        <div className="rounded-2xl bg-white shadow ring-1 ring-slate-200 p-4">
          <div className="text-xs text-slate-500">Promedio por cliente</div>
          <div className="text-2xl font-semibold text-slate-900">
            {data.total_clientes ? (data.total_centros / data.total_clientes).toFixed(1) : "0.0"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow ring-1 ring-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-700">Centros por cliente</div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
            Nuevo cliente
          </button>
        </div>

        {loading && (
          <div className="p-6 text-sm text-slate-500">Cargando resumen...</div>
        )}

        {error && !loading && (
          <div className="p-6 text-sm text-rose-600">Error: {error}</div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-right">Total centros</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.items.map((it) => (
                  <tr key={it.cliente_id} className="odd:bg-white even:bg-slate-50/40">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-600 text-white grid place-items-center text-xs font-semibold">
                          {initials(it.cliente_nombre)}
                        </div>
                        <div className="text-slate-800 font-medium">{it.cliente_nombre}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-900">
                      {it.total_centros}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(it)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                        >
                          Editar
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(it)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-300"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                      No hay datos para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
              {data.items.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr>
                    <td className="px-4 py-2 text-right font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      {data.total_centros}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  {modalMode === "create" ? "Nuevo cliente" : "Editar cliente"}
                </p>
                <h3 className="text-lg font-semibold text-slate-900 mt-1">
                  {modalMode === "create" ? "Agregar cliente" : "Actualizar cliente"}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-700 rounded-full p-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Cerrar"
              >
                x
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
              {modalError && (
                <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 text-rose-700 px-4 py-3 text-sm">
                  {modalError}
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                  Nombre del cliente
                </span>
                <input
                  type="text"
                  value={modalNombre}
                  onChange={(e) => setModalNombre(e.target.value)}
                  placeholder="Ej. Cliente Demo"
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : modalMode === "create" ? "Crear cliente" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
