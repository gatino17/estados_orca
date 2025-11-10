import { useEffect, useState } from "react";

function initials(value = "") {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => (word[0] || "").toUpperCase())
    .join("");
}

export default function Sidebar({
  base,
  onSelectCliente,
  onHoverCliente,
  selectedClienteId,
  compact = false,
  onManageUsers,
  currentUser,
  refreshKey = 0,
}) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadClientes() {
      setLoading(true);
      try {
        const response = await fetch(`${base}/api/clientes`, { cache: "no-store" });
        const data = await response.json();
        if (mounted) setClientes(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error clientes:", error);
        if (mounted) setClientes([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadClientes();
    return () => {
      mounted = false;
    };
  }, [base, refreshKey]);

  return (
    <aside
      className={[
        // Fijo en pantalla y ocupando todo el alto del viewport
        "h-[100dvh] md:sticky md:top-0 ring-1 ring-black/10",
        "bg-gradient-to-b from-blue-950 via-blue-900 to-indigo-800",
        "text-white flex flex-col",
      ].join(" ")}
    >
      <div className="px-4 py-4 border-b border-white/10">
        {!compact ? (
          <>
            <h2 className="text-lg font-semibold">Clientes</h2>
            <p className="text-xs text-white/70">Selecciona un cliente</p>
          </>
        ) : (
          <div className="flex items-center justify-center">
            <span className="text-[11px] tracking-widest text-white/70 uppercase">CL</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && !compact && (
          <div className="text-sm text-white/80 px-2 py-2">Cargando...</div>
        )}
        {!loading && clientes.length === 0 && !compact && (
          <div className="text-sm text-white/80 px-2 py-2">Sin clientes</div>
        )}

        <ul className={compact ? "space-y-2" : "space-y-1"}>
          {clientes.map((cliente) => {
            const isSelected = selectedClienteId === cliente.id;
            const baseClasses =
              "w-full transition rounded-lg focus:outline-none focus:ring-2 focus:ring-white/30";

            if (!compact) {
              return (
                <li key={cliente.id}>
                  <button
                    onMouseEnter={() => onHoverCliente?.(cliente)}
                    onClick={() => onSelectCliente?.(cliente)}
                    className={[
                      "text-left px-3 py-2 hover:bg-white/10",
                      isSelected ? "bg-white/15 ring-1 ring-white/20 font-medium" : "",
                      baseClasses,
                    ].join(" ")}
                  >
                    {cliente.nombre || `Cliente ${cliente.id}`}
                  </button>
                </li>
              );
            }

            return (
              <li key={cliente.id} className="flex justify-center">
                <button
                  title={cliente.nombre || `Cliente ${cliente.id}`}
                  onMouseEnter={() => onHoverCliente?.(cliente)}
                  onClick={() => onSelectCliente?.(cliente)}
                  className={[
                    "h-10 w-10 inline-flex items-center justify-center rounded-full",
                    "bg-white/10 hover:bg-white/20",
                    isSelected ? "ring-2 ring-white/50 bg-white/20" : "ring-1 ring-white/10",
                    baseClasses,
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold">
                    {initials(cliente.nombre || `C${cliente.id}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-4 py-4 border-t border-white/10 bg-white/5">
        {!compact ? (
          <div className="space-y-3">
            {currentUser && (
              <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-white text-slate-900 flex items-center justify-center text-sm font-semibold">
                  {currentUser.name?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="text-xs leading-tight">
                  <div className="font-semibold text-white">
                    {currentUser.name || "Usuario"}
                  </div>
                  <div className="text-white/70 text-[11px]">{currentUser.email}</div>
                </div>
              </div>
            )}

            <button
              onClick={onManageUsers}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-950 focus:ring-white"
            >
              Usuarios
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={onManageUsers}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-950 focus:ring-white"
              aria-label="Gestionar usuarios"
            >
              US
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
