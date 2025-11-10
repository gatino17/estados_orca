import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToggleSwitch from "./ToggleSwitch";

function Dot({ online }) {
  return (
    <span
      title={online ? "Conectado" : "Desconectado"}
      className={[
        "inline-block w-2.5 h-2.5 rounded-full align-middle",
        online
          ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,.2)]"
          : "bg-slate-300",
      ].join(" ")}
    />
  );
}

function fmtLastSeen(iso) {
  if (!iso) return "-";
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

const STATUS_THRESHOLD_SEC = 20;
const FETCH_POLL_MS = 1000;
const CONFIRM_INTERVAL_MS = 400;
const CONFIRM_TIMEOUT_MS = 25000;
const CYCLE_TIMEOUT_MS = 30000;

const NETIO_API_BASE = "/api/netio";
const ENABLE_ACTIONS = true;

const toneStyles = {
  progress: "border-sky-300 bg-sky-50 text-sky-700",
  success: "border-emerald-300 bg-emerald-50 text-emerald-700",
  error: "border-rose-300 bg-rose-50 text-rose-700",
  info: "border-slate-300 bg-slate-50 text-slate-700",
};

function MiniBtn({ title, onClick, disabled, busy, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled || busy}
      className={[
        "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px]",
        "transition hover:bg-slate-50",
        disabled || busy ? "opacity-60 cursor-not-allowed" : "border-slate-300 text-slate-700",
      ].join(" ")}
    >
      {busy ? (
        <span className="inline-block w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
      ) : (
        <span className="inline-block">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="h-3 w-3 text-slate-600"
            aria-hidden="true"
          >
            <path
              d="M4 4v6h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 12a8 8 0 0 1-13.66 5.66L4 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {children}
    </button>
  );
}

function NetioCell({ base, row }) {
  const [states, setStates] = useState({
    pc: false,
    cams: false,
    eq3: false,
    todo: false,
  });
  const [netioOnline, setNetioOnline] = useState(null);
  const [stale, setStale] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const isBusy = !!busyKey;

  const [msg, setMsg] = useState(null);
  const [msgTone, setMsgTone] = useState("info");
  const msgTimerRef = useRef(null);

  const disabledCommon = !ENABLE_ACTIONS || !netioOnline || stale || isBusy;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const mapFromJson = (payload) => ({
    pc: !!payload?.outputs?.["1"],
    cams: !!payload?.outputs?.["2"],
    eq3: !!payload?.outputs?.["3"],
    todo: !!payload?.outputs?.["4"],
    online: !!payload?.online,
    stale: !!payload?.stale,
  });

  const getStateOnce = useCallback(async () => {
    if (!row?.uuid_equipo) return null;
    const url = `${base || ""}${NETIO_API_BASE}/state?uuid_equipo=${encodeURIComponent(row.uuid_equipo)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 404) return { online: false, stale: true, outputs: {} };
    if (!response.ok) return null;
    return response.json();
  }, [base, row?.uuid_equipo]);

  const refreshFromBackend = useCallback(async () => {
    const snapshot = await getStateOnce();
    if (!snapshot) return;
    const mapped = mapFromJson(snapshot);
    setStates((prev) => ({
      ...prev,
      pc: mapped.pc,
      cams: mapped.cams,
      eq3: mapped.eq3,
      todo: mapped.todo,
    }));
    setNetioOnline(mapped.online);
    setStale(mapped.stale);
  }, [getStateOnce]);

  useEffect(() => {
    let intervalId;
    const tick = async () => {
      if (!isBusy) {
        await refreshFromBackend();
      }
    };
    tick();
    intervalId = setInterval(tick, FETCH_POLL_MS);
    return () => clearInterval(intervalId);
  }, [refreshFromBackend, isBusy]);

  const clearMsgTimer = () => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
  };

  const showMsg = (text, tone = "info", ttlMs = 4000) => {
    clearMsgTimer();
    setMsg(text);
    setMsgTone(tone);
    if (ttlMs > 0) {
      msgTimerRef.current = setTimeout(() => {
        setMsg(null);
        msgTimerRef.current = null;
      }, ttlMs);
    }
  };

  const callSingle = async (outlet, action) => {
    const url = `${base || ""}${NETIO_API_BASE}/outlets/${outlet}/${action}?uuid_equipo=${encodeURIComponent(row.uuid_equipo)}`;
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };

  const waitForOutletState = async (outlet, expected, timeoutMs = CONFIRM_TIMEOUT_MS) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const snapshot = await getStateOnce();
      if (snapshot) {
        const current = !!snapshot?.outputs?.[String(outlet)];
        if (current === expected) {
          return mapFromJson(snapshot);
        }
      }
      await delay(CONFIRM_INTERVAL_MS);
    }
    return null;
  };

  const onToggle = async (key, next) => {
    const outlet = key === "pc" ? 1 : key === "cams" ? 2 : key === "eq3" ? 3 : 4;
    const action = next ? "on" : "off";

    setBusyKey(key);
    showMsg(`${next ? "Encendiendo" : "Apagando"} boca ${outlet}...`, "progress", 0);

    try {
      await callSingle(outlet, action);
      const confirmed = await waitForOutletState(outlet, next);
      if (confirmed) {
        setStates((prev) => ({
          ...prev,
          pc: confirmed.pc,
          cams: confirmed.cams,
          eq3: confirmed.eq3,
          todo: confirmed.todo,
        }));
        setNetioOnline(confirmed.online);
        setStale(confirmed.stale);
        showMsg(`Boca ${outlet} ${next ? "encendida" : "apagada"}.`, "success", 2500);
      } else {
        showMsg(`Comando enviado a la boca ${outlet}. Confirmacion pendiente.`, "info", 6000);
      }
    } catch (error) {
      console.error(error);
      showMsg(`No se pudo ejecutar la accion sobre la boca ${outlet}.`, "error", 5000);
    } finally {
      setBusyKey(null);
    }
  };

  const onRestart = async (key) => {
    const outlet = key === "pc" ? 1 : key === "cams" ? 2 : key === "eq3" ? 3 : 4;

    setBusyKey(`${key}-cycle`);
    showMsg(`Reiniciando boca ${outlet}...`, "progress", 0);

    try {
      await callSingle(outlet, "cycle");
      const confirmed = await waitForOutletState(outlet, true, CYCLE_TIMEOUT_MS);
      if (confirmed) {
        setStates((prev) => ({
          ...prev,
          pc: confirmed.pc,
          cams: confirmed.cams,
          eq3: confirmed.eq3,
          todo: confirmed.todo,
        }));
        setNetioOnline(confirmed.online);
        setStale(confirmed.stale);
        showMsg(`Reinicio de boca ${outlet} completado.`, "success", 2500);
      } else {
        showMsg(`Comando de reinicio enviado. Confirmacion pendiente.`, "info", 6000);
      }
    } catch (error) {
      console.error(error);
      showMsg(`No se pudo reiniciar la boca ${outlet}.`, "error", 5000);
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => () => clearMsgTimer(), []);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Dot online={!!netioOnline && !stale} />
        <span>
          {netioOnline === null
            ? "NETIO (sin datos)"
            : netioOnline
            ? stale
              ? "NETIO (stale)"
              : "NETIO OK"
            : "NETIO offline"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            labelTop="Laser"
            checked={!!states.pc}
            busy={busyKey === "pc"}
            disabled={disabledCommon}
            onChange={(value) => onToggle("pc", value)}
            size="sm"
          />
          <MiniBtn
            title="Reiniciar boca 1"
            onClick={() => onRestart("pc")}
            disabled={!ENABLE_ACTIONS || !netioOnline || stale || isBusy}
            busy={busyKey === "pc-cycle"}
          >
            Reiniciar
          </MiniBtn>
        </div>

        <div className="flex items-center gap-2">
          <ToggleSwitch
            labelTop="Nvr"
            checked={!!states.cams}
            busy={busyKey === "cams"}
            disabled={disabledCommon}
            onChange={(value) => onToggle("cams", value)}
            size="sm"
          />
          <MiniBtn
            title="Reiniciar boca 2"
            onClick={() => onRestart("cams")}
            disabled={!ENABLE_ACTIONS || !netioOnline || stale || isBusy}
            busy={busyKey === "cams-cycle"}
          >
            Reiniciar
          </MiniBtn>
        </div>

        <div className="flex items-center gap-2">
          <ToggleSwitch
            labelTop="Radar"
            checked={!!states.eq3}
            busy={busyKey === "eq3"}
            disabled={disabledCommon}
            onChange={(value) => onToggle("eq3", value)}
            size="sm"
          />
          <MiniBtn
            title="Reiniciar boca 3"
            onClick={() => onRestart("eq3")}
            disabled={!ENABLE_ACTIONS || !netioOnline || stale || isBusy}
            busy={busyKey === "eq3-cycle"}
          >
            Reiniciar
          </MiniBtn>
        </div>

        <div className="flex items-center gap-2">
          <ToggleSwitch
            labelTop="Boca 4"
            checked={!!states.todo}
            busy={busyKey === "todo"}
            disabled={!ENABLE_ACTIONS || !netioOnline || stale || isBusy}
            onChange={(value) => onToggle("todo", value)}
            size="sm"
          />
          <MiniBtn
            title="Reiniciar boca 4"
            onClick={() => onRestart("todo")}
            disabled={!ENABLE_ACTIONS || !netioOnline || stale || isBusy}
            busy={busyKey === "todo-cycle"}
          >
            Reiniciar
          </MiniBtn>
        </div>
      </div>

      {msg && (
        <div
          aria-live="polite"
          className={[
            "mt-2 inline-flex items-center gap-2 text-xs rounded-lg px-2 py-1 border",
            toneStyles[msgTone] || toneStyles.info,
          ].join(" ")}
        >
          {msgTone === "progress" && (
            <span className="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          )}
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}

export default function StatusOnlyPage({ base, cliente, embedded = false }) {
  const clienteId = cliente?.id ?? null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetched, setLastFetched] = useState(null);
  const ivRef = useRef(null);

  const loadStatus = useCallback(
    async ({ silent } = { silent: false }) => {
      if (!clienteId) return;
      if (!silent) setLoading(true);

      try {
        const qs = new URLSearchParams({
          cliente_id: String(clienteId),
          threshold_sec: String(STATUS_THRESHOLD_SEC),
          _ts: String(Date.now()),
        }).toString();

        const response = await fetch(`${base}/api/centros/status?${qs}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const rows = (data.items || []).map((item) => ({
          id: item.id,
          nombre: item.nombre,
          online: !!item.online,
          last_seen: item.last_seen || null,
          uuid_equipo: item.uuid_equipo || null,
        }));

        setItems(rows);
        setLastFetched(new Date());
      } catch (error) {
        if (!silent) console.error("StatusOnlyPage loadStatus:", error);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [base, clienteId]
  );

  useEffect(() => {
    if (!clienteId) {
      setItems([]);
      return;
    }
    loadStatus({ silent: false });
  }, [clienteId, loadStatus]);

  useEffect(() => {
    if (!clienteId) return undefined;

    const tick = () => loadStatus({ silent: true });

    if (autoRefresh) {
      tick();
      if (ivRef.current) clearInterval(ivRef.current);
      ivRef.current = setInterval(tick, 3000);
    } else if (ivRef.current) {
      clearInterval(ivRef.current);
      ivRef.current = null;
    }

    const onVis = () => {
      if (autoRefresh && document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (ivRef.current) {
        clearInterval(ivRef.current);
        ivRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [autoRefresh, clienteId, loadStatus]);

  const sorted = useMemo(
    () => items.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
    [items]
  );

  const { totalCentros, onlineCount, offlineCount } = useMemo(() => {
    const total = sorted.length;
    const online = sorted.filter((row) => row.online).length;
    return {
      totalCentros: total,
      onlineCount: online,
      offlineCount: total - online,
    };
  }, [sorted]);

  const onlinePercent = totalCentros ? Math.round((onlineCount / totalCentros) * 100) : 0;
  const offlinePercent = totalCentros ? 100 - onlinePercent : 0;
  const lastUpdatedLabel = lastFetched ? fmtLastSeen(lastFetched.toISOString()) : "-";
  const showEmptyState = !loading && sorted.length === 0;

  const content = (
    <div className="space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              Monitoreo en tiempo real
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">Conexion de centros</h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Visualiza la disponibilidad de los centros y administra las acciones NETIO.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <ToggleSwitch
              size="sm"
              labelTop="Auto-refresh"
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
            <button
              onClick={() => loadStatus({ silent: false })}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Actualizando..." : "Forzar refresh"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl bg-white/70 shadow ring-1 ring-slate-200 px-4 py-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total centros</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{totalCentros}</p>
            <p className="mt-1 text-xs text-slate-500">Resumen global del cliente seleccionado.</p>
          </article>
          <article className="rounded-2xl bg-white/70 shadow ring-1 ring-emerald-200/60 px-4 py-5">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">Online</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">
              {onlineCount}
              <span className="ml-2 text-sm font-medium text-emerald-500">({onlinePercent}%)</span>
            </p>
            <p className="mt-1 text-xs text-emerald-600/80">Centros respondiendo dentro del umbral.</p>
          </article>
          <article className="rounded-2xl bg-white/70 shadow ring-1 ring-rose-200/60 px-4 py-5">
            <p className="text-xs uppercase tracking-[0.3em] text-rose-600">Offline</p>
            <p className="mt-2 text-3xl font-semibold text-rose-700">
              {offlineCount}
              <span className="ml-2 text-sm font-medium text-rose-500">({offlinePercent}%)</span>
            </p>
            <p className="mt-1 text-xs text-rose-600/80">Centros sin respuesta en la ultima verificacion.</p>
          </article>
        </section>

        <section className="rounded-3xl bg-white shadow-xl shadow-slate-200/30 ring-1 ring-slate-200 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              Ultima actualizacion: <span className="font-medium text-slate-800">{lastUpdatedLabel}</span>
            </div>
            <div className="text-xs text-slate-500">
              Auto-refresh consulta cada 3 segundos mientras el interruptor este activo.
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-[0.2em]">
                <tr>
                  <th className="px-4 py-3 text-left">Centro</th>
                  <th className="px-4 py-3 text-left">UUID</th>
                  <th className="px-4 py-3 text-left">Estado LED</th>
                  <th className="px-4 py-3 text-left">NETIO</th>
                  <th className="px-4 py-3 text-left">Ultimo reporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {sorted.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">{row.nombre || `Centro ${row.id}`}</div>
                      <div className="mt-1 text-xs text-slate-500">ID interno: {row.id}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs text-slate-700">{row.uuid_equipo || "-"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        <Dot online={row.online} />
                        {row.online ? "Conectado" : "Desconectado"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <NetioCell base={base} row={row} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-600">{fmtLastSeen(row.last_seen)}</td>
                  </tr>
                ))}

                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                        Consultando estado de los centros...
                      </div>
                    </td>
                  </tr>
                )}

                {showEmptyState && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No hay centros registrados para este cliente o aun no reportan actividad.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            <div className="space-y-4 p-4">
              {sorted.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                >
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {row.nombre || `Centro ${row.id}`}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">ID interno: {row.id}</p>
                    <p className="text-xs text-slate-500">
                      UUID:{" "}
                      <span className="font-mono text-slate-700">
                        {row.uuid_equipo || "-"}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Estado</span>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      <Dot online={row.online} />
                      {row.online ? "Conectado" : "Desconectado"}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-500">NETIO</span>
                    <div className="mt-2">
                      <NetioCell base={base} row={row} />
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    Ultimo reporte:{" "}
                    <span className="font-medium text-slate-700">{fmtLastSeen(row.last_seen)}</span>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                    Consultando estado de los centros...
                  </div>
                </div>
              )}

              {showEmptyState && !loading && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                  No hay centros registrados para este cliente o aun no reportan actividad.
                </div>
              )}
            </div>
          </div>
        </section>
    </div>
  );

  return embedded ? content : (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-7xl mx-auto">{content}</div>
    </div>
  );
}

