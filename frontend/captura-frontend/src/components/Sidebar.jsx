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
  onLogout,
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
      <div className={compact ? "px-1 py-3 border-b border-white/10" : "px-4 py-4 border-b border-white/10"}>
        {!compact ? (
          <>
            <h2 className="text-lg font-semibold">Clientes</h2>
            <p className="text-xs text-white/70">Selecciona un cliente</p>
          </>
        ) : (
          <div className="flex items-center justify-center">
            <span className="text-[10px] tracking-widest text-white/70 uppercase">CL</span>
          </div>
        )}
      </div>

      <div className={compact ? "flex-1 overflow-y-auto px-1 py-2" : "flex-1 overflow-y-auto p-2"}>
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
                    "h-9 w-9 md:h-10 md:w-10 inline-flex items-center justify-center rounded-full",
                    "bg-white/10 hover:bg-white/20",
                    isSelected ? "ring-2 ring-white/50 bg-white/20" : "ring-1 ring-white/10",
                    baseClasses,
                  ].join(" ")}
                >
                  <span className="text-xs font-semibold md:text-sm">
                    {initials(cliente.nombre || `C${cliente.id}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={compact ? "px-1 py-3 border-t border-white/10 bg-white/5" : "px-4 py-4 border-t border-white/10 bg-white/5"}>
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

            <button
              onClick={onLogout}
              className="md:hidden w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-950 focus:ring-white"
            >
              Cerrar sesion
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onManageUsers}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-950 focus:ring-white md:h-10 md:w-10 md:text-sm"
              aria-label="Gestionar usuarios"
            >
              US
            </button>
            <button
              onClick={onLogout}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-950 focus:ring-white"
              aria-label="Cerrar sesion"
              title="Cerrar sesion"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15.75 8.75 19 12l-3.25 3.25" />
                <path d="M19 12H10.5" />
                <path d="M12 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
