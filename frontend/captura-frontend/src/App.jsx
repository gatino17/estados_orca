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

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

/* ------------------------------ Constantes ------------------------------ */

const ROLE_LABELS = { admin: "Administrador", cliente: "Cliente", soporte: "Soporte" };
// Normaliza URLs (quita slash final)
const normalize = (s) => (s || "").replace(/\/$/, "");
const RAW_DEFAULT_BASE = normalize(import.meta.env.VITE_API_BASE ?? "");

const isHttpsPage = () => typeof window !== "undefined" && window.location.protocol === "https:";
const isInsecureAbsoluteUrl = (value) => /^http:\/\//i.test(value || "");
const isLocalAppHost = () => {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};
const allowCustomBase = () => typeof window === "undefined" || isLocalAppHost();
const safeBase = (value) => {
  const next = normalize(value);
  if (!allowCustomBase()) return "";
  return isHttpsPage() && isInsecureAbsoluteUrl(next) ? "" : next;
};
const DEFAULT_BASE = safeBase(RAW_DEFAULT_BASE);

function getInitialBase() {
  try {
    if (!allowCustomBase()) {
      localStorage.removeItem("base");
      return "";
    }
    const stored = normalize(localStorage.getItem("base") || "");
    if (stored && isHttpsPage() && isInsecureAbsoluteUrl(stored)) {
      localStorage.removeItem("base");
      return DEFAULT_BASE;
    }
    return safeBase(stored || DEFAULT_BASE);
  } catch {
    return DEFAULT_BASE;
  }
}

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

function formatSimpleDate(value) {
  if (!value) return "--";
  const parts = String(value).split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  }
  return value;
}

/* --------------------------------- App ---------------------------------- */

export default function App() {
  const [base, setBase] = useState(getInitialBase);
  useEffect(() => {
    try {
      if (base) localStorage.setItem("base", base);
      else localStorage.removeItem("base");
    } catch {}
  }, [base]);
  const handleBaseChange = useCallback((value) => {
    setBase(safeBase(value));
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
  const [searchCentro, setSearchCentro] = useState("");
  const [debouncedSearchCentro, setDebouncedSearchCentro] = useState("");
  
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
  const [totalCentrosCuenta, setTotalCentrosCuenta] = useState(0);
  const [totalCentrales, setTotalCentrales] = useState(0);
  const [centrales, setCentrales] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSinImagen, setTotalSinImagen] = useState(0);
  const [missingNamesTotal, setMissingNamesTotal] = useState([]);
  const [missingCentersTotal, setMissingCentersTotal] = useState([]);
  const [rebootSummary, setRebootSummary] = useState(null);
  const [rebootSummaryLoading, setRebootSummaryLoading] = useState(false);
  const [highlightedCentroId, setHighlightedCentroId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [switchingClienteName, setSwitchingClienteName] = useState("");
  const [section, setSection] = useState("centros"); // 'centros' | 'users' | 'summary'
  const [view, setView] = useState("table");

  // AbortControllers para cancelar solicitudes al cambiar de cliente
  const capturasAbortRef = useRef(null);
  const capturasRequestIdRef = useRef(0);

  // Cache efímera para prefetch por cliente
  const prefetchCacheRef = useRef({}); // { [clienteId]: { rows, statusMap, ts, total, totalPages } }

  const prefetchForCliente = useCallback(async (clienteObj) => {
    const cid = clienteObj?.id;
    if (!cid) return;
    const now = Date.now();
    const search = debouncedSearchCentro.trim();
    const cacheKey = `${cid}|${fecha}|${pageSize}|${search}`;
    const cached = prefetchCacheRef.current[cacheKey];
    if (cached && now - cached.ts < 10000) return; // 10s TTL

    try {
      const qCapt = new URLSearchParams();
      qCapt.set("cliente_id", String(cid));
      if (fecha) qCapt.set("fecha", fecha);
      if (search) qCapt.set("search", search);
      qCapt.set("page", "1");
      qCapt.set("page_size", String(pageSize));

      const rc = await fetch(`${base}/api/capturas?${qCapt.toString()}`, { cache: "no-store" });
      const captData = await rc.json().catch(() => ({}));
      const nextRows = Array.isArray(captData.items) ? captData.items : [];
      const map = {};
      for (const it of nextRows || []) map[it.centro_id] = { online: !!it.online, last_seen: it.last_seen || null };

      prefetchCacheRef.current[cacheKey] = {
        rows: nextRows,
        statusMap: map,
        ts: now,
        total: Number(captData.total || nextRows.length || 0),
        totalCentros: Number(captData.total_centros ?? captData.total ?? nextRows.length ?? 0),
        totalCentrales: Number(captData.total_centrales || 0),
        centrales: Array.isArray(captData.centrales) ? captData.centrales : [],
        totalPages: Number(captData.total_pages || 1),
      };
    } catch {}
  }, [base, debouncedSearchCentro, fecha, pageSize]);

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
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
        return true;
      }
      return false;
    } catch {
      return false;
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
        if (isMobileViewport()) setMenuOpen(false);
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
  }, [cliente?.id, fecha, debouncedSearchCentro]);

  // capturas
  async function loadCapturas(opts = { silent: false }) {
    const cid = opts?.clienteId ?? cliente?.id;
    if (!cid) return;
    if (!opts.silent) setLoading(true);
    const requestId = capturasRequestIdRef.current + 1;
    capturasRequestIdRef.current = requestId;
    try {
      // cancela una petición previa en curso
      if (capturasAbortRef.current) capturasAbortRef.current.abort();
      const ctrl = new AbortController();
      capturasAbortRef.current = ctrl;

      const q = new URLSearchParams();
      q.set("cliente_id", String(cid));
      const fechaVal = opts?.fecha ?? fecha;
      if (fechaVal) q.set("fecha", fechaVal);
      const searchVal = opts?.search ?? debouncedSearchCentro;
      if (searchVal?.trim()) q.set("search", searchVal.trim());
      const requestedPage = opts?.page ?? page;
      q.set("page", String(requestedPage));
      q.set("page_size", String(opts?.pageSize ?? pageSize));

      const r = await fetch(`${base}/api/capturas?${q.toString()}`, { cache: "no-store", signal: ctrl.signal });
      const data = await r.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setRows(items);
      const map = {};
      for (const it of items) map[it.centro_id] = { online: !!it.online, last_seen: it.last_seen || null };
      setStatusMap(map);
      const nextTotalRows = Number(data?.total || items.length || 0);
      setTotalRows(nextTotalRows);
      setTotalCentrosCuenta(Number(data?.total_centros ?? nextTotalRows));
      setTotalCentrales(Number(data?.total_centrales || 0));
      setCentrales(Array.isArray(data?.centrales) ? data.centrales : []);
      setTotalSinImagen(Number(data?.total_sin_imagen || 0));
      setTotalPages(Number(data?.total_pages || 1));
      setMissingNamesTotal(Array.isArray(data?.sin_imagen_nombres) ? data.sin_imagen_nombres : []);
      setMissingCentersTotal(Array.isArray(data?.sin_imagen_centros) ? data.sin_imagen_centros : []);
      setSwitchingClienteName("");
      if (requestedPage > Number(data?.total_pages || 1)) {
        setPage(Number(data?.total_pages || 1) || 1);
      }
      return data;
    } catch (e) {
      if (e && e.name === "AbortError") return; // cambio de cliente
      console.error("capturas:", e);
      setRows([]);
      setStatusMap({});
      setTotalRows(0);
      setTotalCentrosCuenta(0);
      setTotalCentrales(0);
      setCentrales([]);
      setTotalPages(1);
      setTotalSinImagen(0);
      setMissingNamesTotal([]);
      setMissingCentersTotal([]);
    } finally {
      // limpia referencia; si otra petición se inició luego, esta no toca loading
      if (capturasRequestIdRef.current === requestId) {
        capturasAbortRef.current = null;
        setSwitchingClienteName("");
        if (!opts.silent) setLoading(false);
      }
    }
  }

  const loadRebootSummary = useCallback(
    async (opts = {}) => {
      const cid = opts?.clienteId ?? cliente?.id;
      if (!cid) {
        setRebootSummary(null);
        return null;
      }
      if (!opts.silent) setRebootSummaryLoading(true);
      try {
        const q = new URLSearchParams();
        q.set("cliente_id", String(cid));
        const response = await fetch(`${base}/api/ordenes/reinicios/resumen?${q.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        setRebootSummary(data);
        return data;
      } catch (e) {
        console.error("reinicios resumen:", e);
        setRebootSummary(null);
        return null;
      } finally {
        if (!opts.silent) setRebootSummaryLoading(false);
      }
    },
    [base, cliente?.id]
  );

  useEffect(() => {
    if (cliente?.id && view === "cards") {
      loadRebootSummary({ silent: false });
    } else if (!cliente?.id) {
      setRebootSummary(null);
    }
  }, [cliente?.id, view, loadRebootSummary]);

  function handleSearchCentroChange(value) {
    const nextSearch = value.trim();
    setSearchCentro(value);
    setDebouncedSearchCentro(nextSearch);
    setPage(1);
    loadCapturas({ silent: false, page: 1, search: nextSearch });
  }

  async function handleLocateMissingCentro(centro) {
    const centroId = centro?.centro_id ?? centro?.id ?? null;
    const centroName = centro?.nombre || "";
    if (centroId) {
      setHighlightedCentroId(centroId);
      const row = document.querySelector(`[data-centro-id="${centroId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => setHighlightedCentroId(null), 2200);
        return;
      }
    }

    if (centroName) {
      setView("table");
      setSearchCentro(centroName);
      setDebouncedSearchCentro(centroName);
      setPage(1);
      await loadCapturas({ silent: false, page: 1, search: centroName });
      window.setTimeout(() => {
        const row = centroId ? document.querySelector(`[data-centro-id="${centroId}"]`) : null;
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => setHighlightedCentroId(null), 2200);
      }, 120);
    }
  }

  // primer fetch de capturas
  useEffect(() => {
    loadCapturas({ silent: false });
  }, [cliente?.id, fecha, debouncedSearchCentro, page, pageSize, base]);

  // polling de capturas (silencioso) sin duplicar la carga principal al cambiar pagina
  useEffect(() => {
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
  }, [cliente?.id, fecha, debouncedSearchCentro, page, pageSize, base]);

  // mezcla de status con capturas
  const mergedRows = useMemo(() => {
    if (!rows?.length) return rows;
    return rows.map((r) => {
      const s = statusMap[r.centro_id];
      return s ? { ...r, online: s.online, last_seen: s.last_seen } : r;
    });
  }, [rows, statusMap]);

  const totalCentros = totalCentrosCuenta ?? mergedRows?.length ?? 0;
  const hasCentrosTableContent = rows.length > 0 || totalCentros > 0 || totalCentrales > 0;
  const cardsPage = Math.max(1, page || 1);
  const cardsPageSize = Math.max(1, pageSize || 1);
  const cardsTotal = Math.max(0, totalRows || mergedRows?.length || 0);
  const cardsTotalPages = Math.max(1, totalPages || 1);
  const cardsStartIdx = cardsTotal ? (cardsPage - 1) * cardsPageSize + 1 : 0;
  const cardsEndIdx = cardsTotal ? Math.min(cardsStartIdx + cardsPageSize - 1, cardsTotal) : 0;
  const rebootPendingCenters = Array.isArray(rebootSummary?.pendientes_centros)
    ? rebootSummary.pendientes_centros
    : [];
  const rebootPendingPreview = rebootPendingCenters.slice(0, 10);

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
      {loading && switchingClienteName && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm rounded-lg bg-white px-5 py-4 shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full border-4 border-sky-100 border-t-sky-600 animate-spin" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Cargando cliente
                </div>
                <div className="truncate text-base font-medium text-slate-700">
                  {switchingClienteName}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Actualizando centros y estados.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          className={[
            "overflow-hidden",
            // Sidebar fijo también en desktop
            "fixed inset-y-0 left-0 z-40",
            "transition-all duration-300",
            // movil cerrado: oculto; desktop cerrado: rail compacto
            menuOpen ? "translate-x-0 w-64 md:w-64" : "-translate-x-full w-64 md:translate-x-0 md:w-16",
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
              setSwitchingClienteName(formatDisplayName(c?.nombre) || c?.nombre || `Cliente ${c?.id}`);
              setLoading(true);
              const isDifferentCliente = (c?.id ?? null) !== (cliente?.id ?? null);
              const search = isDifferentCliente ? "" : debouncedSearchCentro.trim();
              if (isDifferentCliente) {
                setSearchCentro("");
                setDebouncedSearchCentro("");
              }
              const cached = prefetchCacheRef.current[`${c?.id}|${fecha}|${pageSize}|${search}`];
              if (cached) {
                setRows(cached.rows);
                setStatusMap(cached.statusMap);
                setTotalRows(cached.total || cached.rows?.length || 0);
                setTotalCentrosCuenta(cached.totalCentros ?? cached.total ?? cached.rows?.length ?? 0);
                setTotalCentrales(cached.totalCentrales || 0);
                setCentrales(cached.centrales || []);
                setTotalPages(cached.totalPages || 1);
              } else {
                setRows([]);
                setTotalRows(0);
                setTotalCentrosCuenta(0);
                setTotalCentrales(0);
                setCentrales([]);
                setTotalPages(1);
              }
              setCliente(c);
              setPage(1);
              if (isMobileViewport()) setMenuOpen(false);

              // Cancelar peticiones en curso
              try { if (capturasAbortRef.current) capturasAbortRef.current.abort(); } catch {}

              // Re-disparar cargas inmediatamente para el nuevo cliente
              loadCapturas({ silent: false, clienteId: c?.id, page: 1, pageSize, search });
            }}
            onManageUsers={() => isAdmin && goToSection("users")}
            currentUser={currentUser}
            onLogout={onLogout}
            refreshKey={clientesRefreshKey}
          />
        </div>
      </div>

      {/* Main */}
      <div
        className={[
          "flex-1 min-w-0",
          // en mobile el sidebar cerrado no ocupa espacio; en desktop queda el rail
          menuOpen ? "md:ml-64" : "md:ml-16",
        ].join(" ")}
      >
        {/* Topbar */}
        <div className="sticky top-0 z-30 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-800 text-white shadow ring-1 ring-white/10">
          <div className="max-w-7xl mx-auto px-2 py-2 sm:px-4 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
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
            <div className="flex w-full md:hidden">
              <Hamburger inverted open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
            </div>

            <div className="hidden md:block w-px h-6 bg-white/20 mx-1" />

            {/* Titulo dinamico */}
            <div className="min-w-0 flex-1 sm:flex-none flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-wide sm:text-lg">
                {isUsersSection
                  ? "Gestion de Usuarios"
                  : isSummarySection
                  ? "Resumen de Centros"
                  : "Monitoreo de Centros"}
              </span>
              {isCentrosSection && displayClienteName && (
                <span className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ring-1 ring-white/20 sm:px-3 sm:py-1 sm:text-[11px] sm:tracking-[0.25em]">
                  Cliente:
                  <span className="truncate font-semibold normal-case tracking-normal">
                    {displayClienteName}
                  </span>
                </span>
              )}
            </div>

            {/* Acciones derechas */}
            <div className="flex w-full flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto sm:min-w-[260px] sm:justify-end sm:gap-2">
              <button
                onClick={() => goToSection(isSummarySection ? "centros" : "summary")}
                aria-pressed={isSummarySection}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 sm:px-3 sm:py-2 sm:text-sm ${
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
                      Centros
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
                      Reinicios
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
                      "h-8 w-8 shrink-0 rounded-full sm:h-10 sm:w-10",
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
                      className="h-4 w-4 sm:h-5 sm:w-5"
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

                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 p-1 ring-1 ring-white/15 sm:hidden">
                    <button
                      onClick={() => setView("table")}
                      aria-pressed={view === "table"}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        view === "table"
                          ? "bg-white text-slate-900"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      Centros
                    </button>
                    <button
                      onClick={() => setView("cards")}
                      aria-pressed={view === "cards"}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                        view === "cards"
                          ? "bg-white text-slate-900"
                          : "bg-white/10 text-white/85"
                      }`}
                    >
                      Reinicios
                    </button>
                    <button
                      onClick={() => setView("status")}
                      aria-pressed={view === "status"}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
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
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-blue-900 focus:ring-white sm:inline-flex sm:h-auto sm:w-auto sm:px-3 sm:py-2"
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

                  <div className="order-1 min-w-[170px] flex-1 sm:flex-none">
                    <label className="block text-sm text-slate-600">Fecha</label>
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 text-sm sm:w-auto"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </div>

                  <div className="order-3 min-w-[240px] flex-[1_0_100%] sm:order-2 sm:flex-none">
                    <label className="block text-sm text-slate-600">Buscar centro</label>
                    <div className="relative">
                      <input
                        type="search"
                        className="w-full border rounded px-3 py-2 pr-9 text-sm"
                        value={searchCentro}
                        onChange={(e) => handleSearchCentroChange(e.target.value)}
                        placeholder="Nombre o uuid del centro"
                      />
                      {searchCentro && (
                        <button
                          type="button"
                          onClick={() => handleSearchCentroChange("")}
                          className="absolute inset-y-0 right-1 my-1 inline-flex w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Limpiar busqueda"
                          aria-label="Limpiar busqueda"
                        >
                          x
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={descargarPdf}
                    className="group order-2 inline-flex items-center gap-2 self-end rounded-lg bg-rose-600 px-3 py-2 text-white ring-1 ring-rose-700 shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-400 sm:order-4"
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
                    <span className="text-sm font-semibold">PDF</span>
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
              {cliente?.id && loading && !switchingClienteName && rows.length === 0 && view !== "status" && (
                <div className="text-slate-500 text-sm">
                  Cargando capturas...
                </div>
              )}
              {cliente?.id && !loading && !hasCentrosTableContent && view !== "status" && (
                <div className="text-slate-500 text-sm">
                  Sin capturas para la fecha seleccionada.
                </div>
              )}

              {hasCentrosTableContent && view === "table" && (
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
                      if (debouncedSearchCentro) q.set("search", debouncedSearchCentro);
                      q.set("page", "1");
                      q.set("page_size", "1");
                      const r = await fetch(`${base}/api/capturas?${q.toString()}`, { cache: "no-store" });
                      const list = await r.json();
                      const updated =
                        Array.isArray(list?.items) && list.items.length
                          ? list.items[0]
                          : Array.isArray(list?.centrales) && list.centrales.length
                          ? list.centrales[0]
                          : null;
                      if (!updated) return;
                      if (!updated.es_central) {
                        setRows((prev) => (prev || []).map((it) => (it.centro_id === updated.centro_id ? updated : it)));
                      }
                      if (updated.es_central) {
                        setCentrales((prev) => {
                          const exists = (prev || []).some((it) => it.centro_id === updated.centro_id);
                          if (!exists) return [updated, ...(prev || [])];
                          return (prev || []).map((it) => (it.centro_id === updated.centro_id ? updated : it));
                        });
                      }
                    } catch {}
                  }}
                  refreshStatus={() => loadCapturas({ silent: true })}
                  page={page}
                  pageSize={pageSize}
                  total={totalRows}
                  totalCentros={totalCentros}
                  totalCentrales={totalCentrales}
                  centrales={centrales}
                  totalPages={totalPages}
                  totalSinImagen={totalSinImagen}
                  missingNamesTotal={missingNamesTotal}
                  missingCentersTotal={missingCentersTotal}
                  highlightedCentroId={highlightedCentroId}
                  onLocateCentro={handleLocateMissingCentro}
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
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg bg-gradient-to-r from-rose-500 via-red-500 to-orange-400 p-[1px] shadow-sm">
                    <div className="rounded-[7px] bg-white px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-rose-800">
                            Pendientes de reinicio semanal
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Semana {formatSimpleDate(rebootSummary?.week_start)} al {formatSimpleDate(rebootSummary?.week_end)}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            <div className="text-2xl font-bold leading-none text-slate-900">
                              {rebootSummaryLoading ? "--" : rebootSummary?.total_a_reiniciar ?? 0}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">total</div>
                          </div>
                          <div className="rounded-md bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
                            <div className="text-2xl font-bold leading-none text-emerald-700">
                              {rebootSummaryLoading ? "--" : rebootSummary?.reiniciados ?? 0}
                            </div>
                            <div className="mt-1 text-[11px] text-emerald-700">reiniciados</div>
                          </div>
                          <div className="rounded-md bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
                            <div className="text-2xl font-bold leading-none text-rose-700">
                              {rebootSummaryLoading ? "--" : rebootSummary?.pendientes ?? 0}
                            </div>
                            <div className="mt-1 text-[11px] text-rose-700">pendientes</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {rebootSummaryLoading && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                            Cargando resumen...
                          </span>
                        )}
                        {!rebootSummaryLoading && rebootPendingPreview.length === 0 && (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-800">
                            Semana completa
                          </span>
                        )}
                        {!rebootSummaryLoading &&
                          rebootPendingPreview.map((item) => (
                            <span
                              key={item.centro_id}
                              className={[
                                "rounded-full px-3 py-1 text-[11px] font-semibold ring-1",
                                item.orden_pendiente
                                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                                  : "bg-rose-50 text-rose-800 ring-rose-200",
                              ].join(" ")}
                            >
                              {item.nombre}
                            </span>
                          ))}
                        {!rebootSummaryLoading && rebootPendingCenters.length > rebootPendingPreview.length && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                            +{rebootPendingCenters.length - rebootPendingPreview.length} mas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div className="text-sm text-slate-700">
                      Mostrando <b>{cardsStartIdx}</b> - <b>{cardsEndIdx}</b> de <b>{cardsTotal}</b>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-1.5 ring-1 ring-slate-200 shadow-sm sm:gap-3">
                      <label className="pl-1 text-xs font-medium text-slate-500">Filas</label>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          const ps = Number(e.target.value);
                          setPageSize(ps);
                          setPage(1);
                          try { localStorage.setItem("ct.pageSize", String(ps)); } catch {}
                        }}
                        className="h-8 rounded-lg border-slate-300 bg-slate-50 px-2 text-sm font-medium text-slate-800"
                      >
                        {[10, 15, 30, 50].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <div className="ml-auto flex items-center gap-1 sm:ml-0">
                        <button
                          onClick={() => setPage(1)}
                          disabled={cardsPage <= 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          title="Primera"
                        >{"<<"}</button>
                        <button
                          onClick={() => setPage(Math.max(1, cardsPage - 1))}
                          disabled={cardsPage <= 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          title="Anterior"
                        >{"<"}</button>
                        <span className="min-w-14 rounded-lg bg-blue-50 px-2 py-1.5 text-center text-xs font-bold text-blue-800 ring-1 ring-blue-100">{cardsPage} / {cardsTotalPages}</span>
                        <button
                          onClick={() => setPage(Math.min(cardsTotalPages, cardsPage + 1))}
                          disabled={cardsPage >= cardsTotalPages}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-900 bg-white text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          title="Siguiente"
                        >{">"}</button>
                        <button
                          onClick={() => setPage(cardsTotalPages)}
                          disabled={cardsPage >= cardsTotalPages}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-900 bg-white text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          title="Ultima"
                        >{">>"}</button>
                      </div>
                    </div>
                  </div>

                  {mergedRows.map((row, index) => (
                    <CentroCard
                      key={row.id}
                      base={base}
                      row={row}
                      selectedFecha={fecha}
                      rowNumber={(cardsPage - 1) * cardsPageSize + index + 1}
                      onRebootSummaryRefresh={() => loadRebootSummary({ silent: true })}
                    />
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














