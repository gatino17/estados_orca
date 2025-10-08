# app/routers/netio_status.py
import os
import threading
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/netio", tags=["netio-status"])

# ===== Config =====
STATE_TTL_SECONDS = int(os.getenv("NETIO_STATE_TTL", "45"))  # el agente reporta cada ~10s

# ===== Memoria de proceso =====
_lock = threading.Lock()
_states: Dict[str, dict] = {}  # uuid_equipo -> record

# ===== Schemas =====
class NetioStateIn(BaseModel):
    uuid_equipo: str = Field(..., min_length=1)
    online: Optional[bool] = None
    # Acepta claves "1".."4" o enteros 1..4 con True/False/None
    outputs: Dict[str, Optional[bool]] = Field(default_factory=dict)
    ts: Optional[str] = None  # timestamp enviado por el agente (opcional)

class NetioStateOut(BaseModel):
    uuid_equipo: str
    online: Optional[bool]
    outputs: Dict[str, Optional[bool]]
    updated_at: str          # ISO del servidor
    stale: bool = False      # true si pasó el TTL sin actualizar

# ===== Helpers =====
def _normalize_outputs(outputs: Dict) -> Dict[str, Optional[bool]]:
    # Normaliza a claves "1","2","3","4"
    norm = {"1": None, "2": None, "3": None, "4": None}
    if not outputs:
        return norm
    for k, v in outputs.items():
        sk = str(k).strip()
        if sk in ("1", "2", "3", "4"):
            if v is None:
                norm[sk] = None
            else:
                norm[sk] = bool(v)
    return norm

def _is_stale(updated_dt: datetime) -> bool:
    delta = datetime.now(timezone.utc) - updated_dt
    return delta.total_seconds() > STATE_TTL_SECONDS

# ===== Routes =====
@router.post("/state")
def post_state(body: NetioStateIn):
    now_dt = datetime.now(timezone.utc)
    rec = {
        "uuid_equipo": body.uuid_equipo,
        "online": bool(body.online) if body.online is not None else None,
        "outputs": _normalize_outputs(body.outputs),
        "agent_ts": body.ts,
        "updated_at": now_dt.isoformat(),
        "updated_dt": now_dt,  # para cálculo interno TTL
    }
    with _lock:
        _states[body.uuid_equipo] = rec
    return {"status": "ok", "updated_at": rec["updated_at"]}

@router.get("/state", response_model=NetioStateOut)
def get_state(uuid_equipo: str = Query(..., min_length=1)):
    with _lock:
        rec = _states.get(uuid_equipo)
    if not rec:
        raise HTTPException(status_code=404, detail="Sin estado para ese uuid_equipo")
    return NetioStateOut(
        uuid_equipo=rec["uuid_equipo"],
        online=rec.get("online"),
        outputs=rec.get("outputs") or {},
        updated_at=rec["updated_at"],
        stale=_is_stale(rec["updated_dt"]),
    )

@router.get("/state/all")
def get_all_states():
    items = []
    now = datetime.now(timezone.utc)
    with _lock:
        for rec in _states.values():
            items.append({
                "uuid_equipo": rec["uuid_equipo"],
                "online": rec.get("online"),
                "outputs": rec.get("outputs") or {},
                "updated_at": rec["updated_at"],
                "stale": (now - rec["updated_dt"]).total_seconds() > STATE_TTL_SECONDS,
            })
    return {"items": items}
