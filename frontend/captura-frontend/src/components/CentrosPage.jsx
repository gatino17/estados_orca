// CentrosPage.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import CentrosTable from "./CentrosTable";

const STATUS_THRESHOLD_SEC = 20;

export default function CentrosPage({ base, cliente, fecha }) {
  const [rows, setRows] = useState([]);
  const ivRowsRef = useRef(null);
  const ivStatusRef = useRef(null);

  const loadCapturas = useCallback(async () => {
  if (!cliente?.id) return;
  const qs = new URLSearchParams({
    cliente_id: String(cliente.id),
    ...(fecha ? { fecha } : {}),
    _ts: String(Date.now()),
  }).toString();

  const r = await fetch(`${base}/api/capturas?${qs}`, { cache: "no-store" });
  if (!r.ok) return;
  const data = await r.json();

  // ⛑️ fusiona sin pisar online/last_seen que ya vino de /status
  setRows(prev => {
    const prevById = {};
    for (const p of prev) {
      prevById[p.centro_id] = { online: p.online, last_seen: p.last_seen };
    }
    return data.map(d => {
      const keep = prevById[d.centro_id];
      return keep ? { ...d, ...keep } : d;
    });
  });
}, [base, cliente?.id, fecha]);
  const loadStatus = useCallback(async () => {
    if (!cliente?.id) return;
    const qs = new URLSearchParams({
      cliente_id: String(cliente.id),
      threshold_sec: String(STATUS_THRESHOLD_SEC),
      _ts: String(Date.now()),
    }).toString();
    const r = await fetch(`${base}/api/centros/status?${qs}`, { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    const byId = {};
    for (const it of data.items || []) {
      byId[it.id] = { online: !!it.online, last_seen: it.last_seen || null };
    }

    // 👇 Inyecta online/last_seen en rows para gatillar re-render seguro
    setRows(prev =>
      prev.map(row => {
        const s = byId[row.centro_id];
        return s ? { ...row, online: s.online, last_seen: s.last_seen } : row;
      })
    );

    console.debug("[status] items:", data.items);
  }, [base, cliente?.id]);

  useEffect(() => {
    loadCapturas();
    // Primero carga capturas; luego en ~100ms pide status para pintar el LED rápido
    const t = setTimeout(loadStatus, 100);

    if (ivRowsRef.current) clearInterval(ivRowsRef.current);
    if (ivStatusRef.current) clearInterval(ivStatusRef.current);

    ivRowsRef.current = setInterval(loadCapturas, 15000);
    ivStatusRef.current = setInterval(loadStatus, 5000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadCapturas();
        loadStatus();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearTimeout(t);
      if (ivRowsRef.current) clearInterval(ivRowsRef.current);
      if (ivStatusRef.current) clearInterval(ivStatusRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadCapturas, loadStatus]);

  return (
    <CentrosTable
      base={base}
      rows={rows}                 // 👈 ya vienen con online/last_seen inyectados
      onRefresh={() => { loadCapturas(); loadStatus(); }}
      refreshStatus={loadStatus}
    />
  );
}
