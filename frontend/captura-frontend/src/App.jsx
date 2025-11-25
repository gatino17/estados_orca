import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import "./index.css";
import "./App.css";
import Sidebar from "./components/Sidebar";
import CentroCard from "./components/CentroCard";
import CentrosTable from "./components/CentrosTable";
import CreateCentroModal from "./components/CreateCentroModal";
import LoginPage from "./components/LoginPage";
import UsersPage from "./components/UsersPage";
import StatusOnlyPage from "./components/StatusOnlyPage";
import ToggleSwitch from "./components/ToggleSwitch";
import SummaryCentros from "./components/SummaryCentros";

/* --------------------------------- UI ---------------------------------- */

function Hamburger({ open, onClick, inverted = false }) {
  const bar = inverted ? "bg-white" : "bg-slate-800";
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg hover:bg-white/10 md:hidden"
      aria-label="Toggle menu"
    >
      <div className={`w-6 h-0.5 ${bar} transition ${open ? "rotate-45 translate-y-1.5" : ""}`} />
      <div className={`w-6 h-0.5 ${bar} my-1 transition ${open ? "opacity-0" : ""}`} />
      <div className={`w-6 h-0.5 ${bar} transition ${open ? "-rotate-45 -translate-y-1.5" : ""}`} />
    </button>
  );
}

/* ------------------------------ Constantes ------------------------------ */

const ROLE_LABELS = { admin: "Administrador", cliente: "Cliente", soporte: "Soporte" };
// Normaliza URLs (quita slash final)
const normalize = (s) => (s || "").replace(/\/$/, "");
const DEFAULT_BASE = normalize(import.meta.env.VITE_API_BASE ?? "http://localhost:8000");

function formatDisplayName(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLocaleLowerCase("es-ES");
      return lower.charAt(0).toLocaleUpperCase("es-ES") + lower.slice(1);
    })
    .join(" ");
}

/* --------------------------------- App ---------------------------------- */

export default function App() {
  const [base, setBase] = useState(() => {
    try {
      const stored = localStorage.getItem("base");
      return stored != null ? normalize(stored) : DEFAULT_BASE;
    } catch {
      return DEFAULT_BASE;
    }
  });
  useEffect(() => {
    localStorage.setItem("base", base);
  }, [base]);
  const handleBaseChange = useCallback((value) => {
    setBase(normalize(value));
  }, []);

  const [users, setUsers] = useState([]);

  const [authUserId, setAuthUserId] = useState(() => {
    try {
      const raw = localStorage.getItem("authUserId");
      return raw != null ? Number(raw) : null;
    } catch {
      return null;
    }
  });

  const authUser = useMemo(
    () => users.find((user) => user.id === authUserId) ?? null,
    [users, authUserId]
  );

  const [screen, setScreen] = useState(() => (authUserId ? "dashboard" : "login"));

  useEffect(() => {
    if (authUserId != null) localStorage.setItem("authUserId", String(authUserId));
    else localStorage.removeItem("authUserId");
  }, [authUserId]);

  const extractErrorMessage = useCallback(async (response) => {
    try {
      const data = await response.json();
      if (typeof data === "string") return data;
      if (data?.detail) return data.detail;
      return response.statusText || "Ocurrio un error inesperado";
    } catch {
      return response.statusText || "Ocurrio un error inesperado";
    }
  }, []);

  const refreshUsers = useCallback(
    async (baseUrl = base) => {
      try {
        const res = await fetch(`${baseUrl}/api/users`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(await extractErrorMessage(res));
        }
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error al obtener usuarios:", error);
        throw error;
      }
    },
    [base, extractErrorMessage]
  );

  useEffect(() => {
    if (screen === "dashboard") {
      refreshUsers().catch(() => {});
    }
  }, [screen, refreshUsers]);

  async function handleLogin(credentials) {
    const { email, password } = credentials;
    try {
      const res = await fetch(`${base}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      const user = await res.json();
      setAuthUserId(user.id);
      setScreen("dashboard");
      await refreshUsers();
      return user;
    } catch (error) {
      throw error instanceof Error ? error : new Error("No fue posible iniciar sesion");
    }
  }

  const handleLogout = useCallback(() => {
    setAuthUserId(null);
    setUsers([]);
    setScreen("login");
  }, []);

  const handleCreateUser = useCallback(
    async (payload) => {
      const res = await fetch(`${base}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      await refreshUsers();
    },
    [base, extractErrorMessage, refreshUsers]
  );

  const handleUpdateUser = useCallback(
    async (id, updates) => {
      const res = await fetch(`${base}/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      await refreshUsers();
    },
    [base, extractErrorMessage, refreshUsers]
  );

  const handleDeleteUser = useCallback(
    async (id) => {
      const res = await fetch(`${base}/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res));
      }
      await refreshUsers();
      if (authUserId === id) {
        handleLogout();
      }
    },
    [authUserId, base, extractErrorMessage, refreshUsers, handleLogout]
  );

  if (screen === "login") {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <DashboardShell
      currentUser={authUser}
      users={users}
      base={base}
      setBase={handleBaseChange}
      onRefreshUsers={refreshUsers}
      onCreateUser={handleCreateUser}
      onUpdateUser={handleUpdateUser}
      onDeleteUser={handleDeleteUser}
      onLogout={handleLogout}
    />
  );
}

/* --------------------------- Dashboard (Shell) -------------------------- */

function DashboardShell({
  currentUser,
  users = [],
  base,
  setBase,
  onRefreshUsers,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onLogout = () => {},
}) {
  const [cliente, setCliente] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clientesRefreshKey, setClientesRefreshKey] = useState(0);

  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  });
  
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const raw = localStorage.getItem("ct.pageSize");
      const n = raw ? parseInt(raw, 10) : 15;
      return [10, 15, 30, 50].includes(n) ? n : 15;
    } catch {
      return 15;
    }
  });
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState("centros"); // 'centros' | 'users' | 'summary'
  const [view, setView] = useState("table");

  // AbortControllers para cancelar solicitudes al cambiar de cliente
  const capturasAbortRef = useRef(null);

  // Cache efímera para prefetch por cliente
  const prefetchCacheRef = useRef({}); // { [clienteId]: { rows, statusMap, ts, total, totalPages } }

  const prefetchForCliente = useCallback(async (clienteObj) => {
    const cid = clienteObj?.id;
    if (!cid) return;
    const now = Date.now();
    const cached = prefetchCacheRef.current[cid];
    if (cached && now - cached.ts < 10000) return; // 10s TTL

    try {
      const qCapt = new URLSearchParams();
      qCapt.set("cliente_id", String(cid));
      if (fecha) qCapt.set("fecha", fecha);
      qCapt.set("page", "1");
      qCapt.set("page_size", String(pageSize));

      const rc = await fetch(`${base}/api/capturas?${qCapt.toString()}`, { cache: "no-store" });
      const captData = await rc.json().catch(() => ({}));
      const nextRows = Array.isArray(captData.items) ? captData.items : [];
      const map = {};
      for (const it of nextRows || []) map[it.centro_id] = { online: !!it.online, last_seen: it.last_seen || null };

      prefetchCacheRef.current[cid] = {
        rows: nextRows,
        statusMap: map,
        ts: now,
        total: Number(captData.total || nextRows.length || 0),
        totalPages: Number(captData.total_pages || 1),
      };
    } catch {}
  }, [base, fecha, pageSize]);

  // Prefetch silencioso de los primeros clientes tras cargar la lista
  useEffect(() => {
    if (!Array.isArray(clientes) || clientes.length === 0) return;
    let cancelled = false;
    const LIMIT = 4; // cantidad de clientes a precargar (ajustado)
    const list = clientes.slice(0, LIMIT);
    (async () => {
      for (const c of list) {
        if (cancelled) break;
        try { await prefetchForCliente(c); } catch {}
        // pequeño respiro para no saturar la red
        await new Promise((r) => setTimeout(r, 60));
      }
    })();
    return () => { cancelled = true; };
  }, [clientes, prefetchForCliente]);

  
  useEffect(() => {
    if (section === "users") {
      onRefreshUsers?.().catch(() => {});
    }
  }, [section, onRefreshUsers]);


  // Sidebar abierto/cerrado (persistido)
  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("menuOpen") ?? "true");
    } catch {
      return true;
    }
  });
  useEffect(() => {
    localStorage.setItem("menuOpen", JSON.stringify(menuOpen));
  }, [menuOpen]);

  const displayClienteName = formatDisplayName(cliente?.nombre);
  const isUsersSection = section === "users";
  const isSummarySection = section === "summary";
  const isCentrosSection = section === "centros";
  const isAdmin = currentUser?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);

  const goToSection = useCallback(
    (target) => {
      setSection(target);
      if (target !== "centros") {
        setCreateOpen(false);
      }
      if (target === "users") {
        if (!isAdmin) return;
        setMenuOpen(false);
      }
    },
    [setSection, setCreateOpen, setMenuOpen, isAdmin]
  );

  // ====== estado de status (LED) ======
  const [statusMap, setStatusMap] = useState({}); // { [centro_id]: { online, last_seen } }

  const ivRowsRef = useRef(null);

  const loadClientes = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/clientes`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setClientes(next);

      if (!next.length) {
        setCliente(null);
      } else {
        setCliente((prev) => {
          if (!prev) return next[0];
          return next.find((item) => item.id === prev.id) ?? next[0];
        });
      }

      setClientesRefreshKey((prev) => prev + 1);
    } catch (e) {
      console.error("clientes:", e);
    }
  }, [base]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  useEffect(() => {
    setPage(1);
  }, [cliente?.id, fecha]);

  // capturas
  async function loadCapturas(opts = { silent: false }) {
    const cid = opts?.clienteId ?? cliente?.id;
    if (!cid) return;
    if (!opts.silent) setLoading(true);
    try {
      // cancela una petición previa en curso
      if (capturasAbortRef.current) capturasAbortRef.current.abort();
      const ctrl = new AbortController();
      capturasAbortRef.current = ctrl;

      const q = new URLSearchParams();
      q.set("cliente_id", String(cid));
      const fechaVal = opts?.fecha ?? fecha;
      if (fechaVal) q.set("fecha", fechaVal);
      q.set("page", String(opts?.page ?? page));
      q.set("page_size", String(opts?.pageSize ?? pageSize));

      const r = await fetch(`${base}/api/capturas?${q.toString()}`, { cache: "no-store", signal: ctrl.signal });
      const data = await r.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
      const map = {};
      for (const it of items) map[it.centro_id] = { online: !!it.online, last_seen: it.last_seen || null };
      setStatusMap(map);
      setTotalRows(Number(data?.total || items.length || 0));
      setTotalPages(Number(data?.total_pages || 1));
      if (page > Number(data?.total_pages || 1)) {
        setPage(Number(data?.total_pages || 1) || 1);
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // cambio de cliente
      console.error("capturas:", e);
      setRows([]);
      setStatusMap({});
      setTotalRows(0);
      setTotalPages(1);
    } finally {
      // limpia referencia; si otra petición se inició luego, esta no toca loading
      capturasAbortRef.current = null;
      if (!opts.silent) setLoading(false);
    }
  }

  // primer fetch de capturas
  useEffect(() => {
    loadCapturas({ silent: false });
  }, [cliente?.id, fecha, page, pageSize, base]);

  // polling de capturas (silencioso) sin forzar recarga de imágenes
  useEffect(() => {
    loadCapturas({ silent: true });

    if (ivRowsRef.current) clearInterval(ivRowsRef.current);
    ivRowsRef.current = setInterval(() => {
      loadCapturas({ silent: true });
    }, 10000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadCapturas({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (ivRowsRef.current) clearInterval(ivRowsRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cliente?.id, fecha, page, pageSize, base]);

  // mezcla de status con capturas
  const mergedRows = useMemo(() => {
    if (!rows?.length) return rows;
    return rows.map((r) => {
      const s = statusMap[r.centro_id];
      return s ? { ...r, online: s.online, last_seen: s.last_seen } : r;
    });
  }, [rows, statusMap]);

  const totalCentros = totalRows || mergedRows?.length || 0;

  // PDF
  async function descargarPdf() {
    if (!cliente?.id || !fecha) return;
    try {
      const q = new URLSearchParams({
        cliente_id: String(cliente.id),
        fecha,
        _ts: String(Date.now()),
      }).toString();

      const r = await fetch(`${base}/api/reportes/reporte/pdf?${q}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe_${cliente?.nombre || "cliente"}_${fecha}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("No se pudo generar el PDF: " + e.message);
    }
  }

  /* ------------------------------- Render ------------------------------- */

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <div className="relative">
        {/* Overlay movil */}
        <div
          onClick={() => setMenuOpen(false)}
          className={[
            "fixed inset-0 z-30 bg-black/30 md:hidden transition-opacity",
            menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
          ].join(" ")}
        />
        <div
          aria-hidden={!menuOpen}
          className={[
            "overflow-hidden",
            // Sidebar fijo también en desktop
            "fixed inset-y-0 left-0 z-40",
            "transition-all duration-300",
            // móvil: desliza; desktop: rail (64/16)
            menuOpen ? "translate-x-0 w-64 md:w-64" : "-translate-x-full md:translate-x-0 md:w-16",
          ].join(" ")}
        >
          <Sidebar
            base={base}
            onHoverCliente={prefetchForCliente}
            selectedClienteId={cliente?.id}
            compact={!menuOpen}
            onSelectCliente={(c) => {
              goToSection("centros");
              // Preparar transición rápida
              setLoading(true);
              const cached = prefetchCacheRef.current[c?.id];
              if (cached) {
                setRows(cached.rows);
                setStatusMap(cached.statusMap);
                setTotalRows(cached.total || cached.rows?.length || 0);
                setTotalPages(cached.totalPages || 1);
              } else {
                setRows([]);
                setTotalRows(0);
                setTotalPages(1);
              }
              setCliente(c);
              setPage(1);
              setMenuOpen(false); // cerrar en movil tras elegir

              // Cancelar peticiones en curso
              try { if (capturasAbortRef.current) capturasAbortRef.current.abort(); } catch {}

              // Re-disparar cargas inmediatamente para el nuevo cliente
              loadCapturas({ silent: false, clienteId: c?.id, page: 1, pageSize });
            }}
            onManageUsers={() => isAdmin && goToSection("users")}
            currentUser={currentUser}
            refreshKey={clientesRefreshKey}
          />
        </div>
      </div>

      {/* Main */}
      <div
        className={[
          "flex-1 min-w-0",
          // deja espacio permanente para el sidebar fijo en desktop
          menuOpen ? "md:ml-64" : "md:ml-16",
        ].join(" ")}
      >
        {/* Topbar */}
        <div className="sticky top-0 z-30 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-800 text-white shadow ring-1 ring-white/10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            {/* Switch pegado al sidebar */}
            <div className="hidden md:flex items-center -ml-1 mr-2">
              <ToggleSwitch
                size="sm"
                labelTop="menu"
                labelClassName="text-white/90"
                checked={menuOpen}
                onChange={setMenuOpen}
              />
            </div>

            {/* Hamburguesa (movil) */}
            <Hamburger inverted open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />

            <div className="hidden md:block w-px h-6 bg-white/20 mx-1" />

            {/* Titulo dinamico */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold tracking-wide">
                {isUsersSection
                  ? "Gestion de Usuarios"
                  : isSummarySection
                  ? "Resumen de Centros"
                  : "Monitoreo de Centros"}
              </span>
              {isCentrosSection && displayClienteName && (
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.25em] px-3 py-1 rounded-full bg-white/10 ring-1 ring-white/20">
                  Cliente:
                  <span className="font-semibold normal-case tracking-normal">
                    {displayClienteName}
                  </span>
                </span>
              )}
              {isCentrosSection && (
                <span className="text-xs px-3 py-1 rounded-full bg-white/10 ring-1 ring-white/20">
                  Total Centros: <span className="font-semibold">{totalCentros}</span>
                </span>
              )}
            </div>

            {/* Acciones derechas */}
            <div className="ml-auto flex flex-wrap items-center gap-2 justify-end min-w-[260px]">
              <button
                onClick={() => goToSection(isSummarySection ? "centros" : "summary")}
                aria-pressed={isSummarySection}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 ${
                  isSummarySection
                    ? "bg-white text-slate-900 shadow focus:ring-white"
                    : "bg-white/10 text-white/85 ring-1 ring-white/20 hover:bg-white/15 focus:ring-white/30"
                }`}
              >
                Resumen
              </button>

              {isCentrosSection && (
                <>
                  <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-lg p-1 ring-1 ring-white/15">
                    <button
                      onClick={() => setView("table")}
                      aria-pressed={view === "table"}
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        view === "table"
                          ? "bg-white text-slate-900 shadow"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      Tabla
                    </button>
                    <button
                      onClick={() => setView("cards")}
                      aria-pressed={view === "cards"}
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        view === "cards"
                          ? "bg-white text-slate-900 shadow"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      Tarjetas
                    </button>
                    <button
                      onClick={() => setView("status")}
                      aria-pressed={view === "status"}
                      title="Vista de prueba del LED en vivo"
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        view === "status"
                          ? "bg-white text-slate-900 shadow"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      Status
                    </button>
                  </div>

                  <button
                    onClick={() => setCreateOpen(true)}
                    disabled={!cliente?.id}
                    className={[
                      "inline-flex items-center justify-center",
                      "h-10 w-10 rounded-full",
                      "bg-emerald-500 text-slate-900",
                      "hover:bg-emerald-400",
                      "ring-1 ring-emerald-200 shadow",
                      "transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 focus:ring-white",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    ].join(" ")}
                    title={!cliente?.id ? "Selecciona un cliente primero" : "Crear centro"}
                    aria-label="Crear centro"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 5v14M5 12h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <div className="flex sm:hidden items-center gap-2">
                    <button
                      onClick={() => setView("table")}
                      aria-pressed={view === "table"}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        view === "table"
                          ? "bg-white text-slate-900"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      Tabla
                    </button>
                    <button
                      onClick={() => setView("cards")}
                      aria-pressed={view === "cards"}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        view === "cards"
                          ? "bg-white text-slate-900"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      Tarjetas
                    </button>
                    <button
                      onClick={() => setView("status")}
                      aria-pressed={view === "status"}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        view === "status"
                          ? "bg-white text-slate-900"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      Status
                    </button>
                  </div>
                </>
              )}

              <button
                onClick={onLogout}
                className="inline-flex items-center justify-center rounded-full bg-white/10 px-3 py-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 focus:ring-white"
                title="Cerrar sesi?n"
                aria-label="Cerrar sesi?n"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M15.75 8.75 19 12l-3.25 3.25M19 12H10.5M12 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {isUsersSection && isAdmin ? (
          <div className="max-w-7xl mx-auto px-4 py-6">
            <UsersPage
              embedded
              currentUser={currentUser}
              users={users}
              onCreateUser={onCreateUser}
              onUpdateUser={onUpdateUser}
              onDeleteUser={onDeleteUser}
              onEnterDashboard={() => goToSection("centros")}
            />
          </div>
        ) : isSummarySection ? (
          <div className="max-w-7xl mx-auto px-4 py-6">
            <SummaryCentros base={base} onChanged={loadClientes} canDelete={isAdmin} />
          </div>
        ) : isUsersSection && !isAdmin ? (
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="text-sm text-rose-600">Acceso no autorizado a la gesti&oacute;n de usuarios.</div>
            <button
              onClick={() => goToSection("centros")}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Volver
            </button>
          </div>
        ) : (
          <>
            {view !== "status" && isCentrosSection && (
              <div className="max-w-7xl mx-auto px-4 py-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="hidden">
                    <label className="block text-sm text-slate-600">Cliente</label>
                    <input
                      className="border rounded px-3 py-2 text-sm w-64 bg-slate-100"
                      value={cliente?.nombre || ""}
                      readOnly
                      placeholder="Selecciona un cliente"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-slate-600">Fecha</label>
                    <input
                      type="date"
                      className="border rounded px-3 py-2 text-sm"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={() => loadCapturas({ silent: false })}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"
                  >
                    Buscar
                  </button>

                  <button
                    onClick={descargarPdf}
                    className="group inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-300"
                    title="Descargar informe PDF (hoy)"
                    aria-label="Descargar PDF"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="w-5 h-5 sm:w-6 sm:h-6"
                      aria-hidden="true"
                    >
                      <g className="text-slate-800">
                        <path
                          d="M14 2H7.5A2.5 2.5 0 0 0 5 4.5v15A2.5 2.5 0 0 0 7.5 22h9A2.5 2.5 0 0 0 19 19.5V9l-5-7Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M14 2v6h6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </g>
                      <g className="text-rose-600">
                        <rect x="6.8" y="8" width="8.4" height="4" rx="1.2" fill="currentColor" />
                        <text
                          x="11"
                          y="10.8"
                          fill="#fff"
                          fontSize="2.6"
                          fontWeight="700"
                          textAnchor="middle"
                          fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial"
                        >
                          PDF
                        </text>
                        <g className="transform transition -translate-y-[1px] group-hover:translate-y-0">
                          <path
                            d="M11 14v3.2"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                          <path
                            d="M9.3 16.3 11 18l1.7-1.7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      </g>
                    </svg>
                    <span className="hidden sm:inline"></span>
                  </button>

                  {/* Campo de backend ocultado: ya no se muestra en UI */}
                </div>
              </div>
            )}

            {createOpen && (
              <CreateCentroModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                base={base}
                cliente={cliente}
                onCreated={() => {
                  setCreateOpen(false);
                  loadCapturas({ silent: false });
                }}
              />
            )}

            <div className="max-w-7xl mx-auto px-4 pb-8">
              {!cliente?.id && (
                <div className="text-slate-500 text-sm">
                  Selecciona un cliente en el menu izquierdo.
                </div>
              )}
              {cliente?.id && loading && view !== "status" && (
                <div className="bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden">
                  <div className="px-3 md:px-4 py-3 border-b bg-slate-50/60 flex items-center justify-between">
                    <div className="text-sm text-slate-600">Cargando capturas...</div>
                    <div className="animate-pulse h-3 w-24 bg-slate-200 rounded" />
                  </div>
                  <div className="divide-y divide-slate-200">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="grid grid-cols-6 gap-4 px-3 md:px-4 py-4 animate-pulse">
                        <div className="col-span-2 h-4 bg-slate-200 rounded" />
                        <div className="col-span-1 h-4 bg-slate-200 rounded" />
                        <div className="col-span-1 h-4 bg-slate-200 rounded" />
                        <div className="col-span-1 h-20 bg-slate-200 rounded" />
                        <div className="col-span-1 h-6 bg-slate-200 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cliente?.id && !loading && rows.length === 0 && view !== "status" && (
                <div className="text-slate-500 text-sm">
                  Sin capturas para la fecha seleccionada.
                </div>
              )}

              {rows.length > 0 && view === "table" && (
                <CentrosTable
                  base={base}
                  rows={mergedRows}
                  onRefresh={() => loadCapturas({ silent: false })}
                  onRefreshRow={async (row) => {
                    if (!row?.centro_id || !cliente?.id) return;
                    try {
                      const q = new URLSearchParams();
                      q.set("cliente_id", String(cliente.id));
                      q.set("centro_id", String(row.centro_id));
                      if (fecha) q.set("fecha", fecha);
                      q.set("page", "1");
                      q.set("page_size", "1");
                      const r = await fetch(`${base}/api/capturas?${q.toString()}`, { cache: "no-store" });
                      const list = await r.json();
                      const updated = Array.isArray(list?.items) && list.items.length ? list.items[0] : null;
                      if (!updated) return;
                      setRows((prev) => (prev || []).map((it) => (it.centro_id === updated.centro_id ? updated : it)));
                    } catch {}
                  }}
                  refreshStatus={() => loadCapturas({ silent: true })}
                  page={page}
                  pageSize={pageSize}
                  total={totalRows}
                  totalPages={totalPages}
                  onPageChange={(p) => setPage(p)}
                  onPageSizeChange={(ps) => {
                    setPageSize(ps);
                    setPage(1);
                    try { localStorage.setItem("ct.pageSize", String(ps)); } catch {}
                  }}
                  canDelete={currentUser?.role === "admin"}
                />
              )}

              {rows.length > 0 && view === "cards" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {mergedRows.map((row) => (
                    <CentroCard key={row.id} base={base} row={row} selectedFecha={fecha} />
                  ))}
                </div>
              )}

              {cliente?.id && view === "status" && (
                <StatusOnlyPage base={base} cliente={cliente} embedded />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}














