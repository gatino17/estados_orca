# app/routers/netio_actions.py
import asyncio
import itertools
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/netio", tags=["netio-actions"])

# ---- cola en memoria por equipo ----
_queues: Dict[str, asyncio.Queue] = {}
_id_counter = itertools.count(1)

def _q(uuid: str) -> asyncio.Queue:
    if uuid not in _queues:
        _queues[uuid] = asyncio.Queue()
    return _queues[uuid]

# ---- acciones permitidas ----
ACTIONS = {
    "off": 0,
    "on": 1,
    "short_off": 2, "cycle": 2, "restart": 2,
    "short_on": 3,
    "toggle": 4,
    "nochange": 5,
}

class BatchIn(BaseModel):
    uuid_equipo: str
    action: str
    outlets: List[int] = Field(default_factory=list)

class CmdOut(BaseModel):
    id: int
    uuid_equipo: str
    created_at: str
    items: List[dict]

@router.post("/outlets/{outlet}/{action}")
async def enqueue_single(outlet: int, action: str, uuid_equipo: str = Query(...)):
    act = action.lower()
    if act not in ACTIONS:
        raise HTTPException(400, f"action inválida '{action}'")
    if outlet not in (1, 2, 3, 4):
        raise HTTPException(400, "outlet debe ser 1..4")

    cmd = {
        "id": next(_id_counter),
        "uuid_equipo": uuid_equipo,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "items": [{"id": outlet, "action": ACTIONS[act]}],
    }
    await _q(uuid_equipo).put(cmd)
    return {"status": "enqueued", "cmd_id": cmd["id"]}

@router.post("/outlets/batch")
async def enqueue_batch(body: BatchIn):
    act = body.action.lower()
    if act not in ACTIONS:
        raise HTTPException(400, f"action inválida '{body.action}'")
    outs = [o for o in body.outlets if o in (1, 2, 3, 4)]
    if not outs:
        raise HTTPException(400, "outlets debe contener números 1..4")

    cmd = {
        "id": next(_id_counter),
        "uuid_equipo": body.uuid_equipo,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "items": [{"id": o, "action": ACTIONS[act]} for o in outs],
    }
    await _q(body.uuid_equipo).put(cmd)
    return {"status": "enqueued", "cmd_id": cmd["id"]}

@router.get("/command/pull", response_model=CmdOut)
async def pull(uuid_equipo: str = Query(...), wait: int = Query(20, ge=0, le=60)):
    q = _q(uuid_equipo)
    try:
        cmd = await asyncio.wait_for(q.get(), timeout=wait if wait > 0 else 0.01)
    except asyncio.TimeoutError:
        # id=0 significa "no hay nada"
        return {
            "id": 0,
            "uuid_equipo": uuid_equipo,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "items": [],
        }
    return cmd

@router.post("/command/{cmd_id}/ack")
async def ack(cmd_id: int):
    return {"status": "ok", "ack": cmd_id}
