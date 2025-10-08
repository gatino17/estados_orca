# app/routers/centros.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import desc
from app.models.capturas import Captura
from datetime import datetime, timedelta, timezone
from contextlib import suppress
from fastapi.responses import JSONResponse

from fastapi import status
from sqlalchemy import delete
from app.models.capturas import Captura, CapturaVersion
from app.models.ordenes import OrdenCaptura
from app.models.dispositivos import Dispositivo

import asyncio


from app.db.session import get_db
from app.models.centros import Centro

router = APIRouter(prefix="/api/centros", tags=["centros"])


# ————— util —————
def slugify(name: str) -> str:
    s = name.lower().strip().replace(" ", "_")
    return "".join(ch for ch in s if ch.isalnum() or ch in "-_")

# ————— schemas —————
class CentroCreate(BaseModel):
    cliente_id: int
    nombre: str
    observacion: Optional[str] = "sn"
    grabacion: Optional[str] = "correcto"
    # NUEVO: permitir pasar uuid_equipo (opcional). Si no viene, lo generamos.
    uuid_equipo: Optional[str] = None

class CentroUpdate(BaseModel):
    nombre: Optional[str] = None
    observacion: Optional[str] = None
    grabacion: Optional[str] = None
    uuid_equipo: Optional[str] = None

# ————— create —————
@router.post("", status_code=201)
async def crear_centro(payload: CentroCreate, db: AsyncSession = Depends(get_db)):
    # Evitar duplicados simples por (cliente_id, nombre)
    exists = await db.execute(
        select(Centro).where(
            Centro.cliente_id == payload.cliente_id,
            Centro.nombre == payload.nombre
        )
    )
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe un centro con ese nombre para este cliente")

    # NUEVO: autogenerar uuid_equipo si no viene
    uuid_equipo = payload.uuid_equipo or slugify(payload.nombre)

    # NUEVO: validar unicidad de uuid_equipo
    clash = await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))
    if clash.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="uuid_equipo ya está en uso por otro centro")

    cen = Centro(
        cliente_id=payload.cliente_id,
        nombre=payload.nombre,
        observacion=payload.observacion or "sn",
        grabacion=payload.grabacion or "correcto",
        estado="activo",
        # NUEVO
        uuid_equipo=uuid_equipo,
    )
    db.add(cen)
    await db.commit()
    await db.refresh(cen)
    return {
        "id": cen.id,
        "cliente_id": cen.cliente_id,
        "nombre": cen.nombre,
        "observacion": cen.observacion,
        "grabacion": cen.grabacion,
        "estado": cen.estado,
        # NUEVO
        "uuid_equipo": cen.uuid_equipo,
    }

# ————— list —————
@router.get("")
async def listar_centros(
    cliente_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Centro)
    if cliente_id:
        q = q.where(Centro.cliente_id == cliente_id)
    res = await db.execute(q.order_by(Centro.nombre.asc()))
    centros = res.scalars().all()
    return [
        {
            "id": c.id,
            "cliente_id": c.cliente_id,
            "nombre": c.nombre,
            "observacion": c.observacion,
            "grabacion": c.grabacion,
            "estado": c.estado,
            # NUEVO
            "uuid_equipo": c.uuid_equipo,
        }
        for c in centros
    ]

# ————— update (opcional pero muy útil para corregir uuid_equipo) —————
@router.patch("/{centro_id}")
async def actualizar_centro(centro_id: int, payload: CentroUpdate, db: AsyncSession = Depends(get_db)):
    cen = (await db.execute(select(Centro).where(Centro.id == centro_id))).scalar_one_or_none()
    if not cen:
        raise HTTPException(status_code=404, detail="centro no encontrado")

    if payload.nombre is not None:
        cen.nombre = payload.nombre
    if payload.observacion is not None:
        cen.observacion = payload.observacion
    if payload.grabacion is not None:
        cen.grabacion = payload.grabacion
    if payload.uuid_equipo is not None:
        new_uuid = payload.uuid_equipo or slugify(cen.nombre)
        if new_uuid != cen.uuid_equipo:
            clash = (await db.execute(select(Centro).where(Centro.uuid_equipo == new_uuid))).scalar_one_or_none()
            if clash:
                raise HTTPException(status_code=409, detail="uuid_equipo ya está en uso por otro centro")
            cen.uuid_equipo = new_uuid

    await db.commit()
    await db.refresh(cen)
    return {
        "id": cen.id,
        "cliente_id": cen.cliente_id,
        "nombre": cen.nombre,
        "observacion": cen.observacion,
        "grabacion": cen.grabacion,
        "estado": cen.estado,
        "uuid_equipo": cen.uuid_equipo,
    }


@router.delete("/{centro_id}")
async def eliminar_centro(centro_id: int, db: AsyncSession = Depends(get_db)):
    cen = (await db.execute(select(Centro).where(Centro.id == centro_id))).scalar_one_or_none()
    if not cen:
        raise HTTPException(status_code=404, detail="centro no encontrado")

    # 1) ids de capturas del centro
    cap_ids = [
        r[0] for r in (await db.execute(select(Captura.id).where(Captura.centro_id == centro_id))).all()
    ]

    if cap_ids:
        # 2) borrar versiones
        await db.execute(delete(CapturaVersion).where(CapturaVersion.captura_id.in_(cap_ids)))
        # 3) borrar órdenes
        await db.execute(delete(OrdenCaptura).where(OrdenCaptura.captura_id.in_(cap_ids)))
        # 4) borrar capturas
        await db.execute(delete(Captura).where(Captura.id.in_(cap_ids)))

    # 5) (opcional) borrar dispositivos del centro
    await db.execute(delete(Dispositivo).where(Dispositivo.centro_id == centro_id))

    # 6) borrar el centro
    await db.delete(cen)

    await db.commit()
    return {"ok": True}

@router.get("/resolve")
async def resolve_por_uuid(uuid_equipo: str, db: AsyncSession = Depends(get_db)):
    cen = (await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))).scalar_one_or_none()
    if not cen:
        raise HTTPException(status_code=404, detail="uuid_equipo no encontrado")

    # Dispositivo "por defecto": último usado en este centro, o 1 si no hay historial
    last = (
        await db.execute(
            select(Captura.dispositivo_id)
            .where(Captura.centro_id == cen.id)
            .order_by(desc(Captura.created_at))
            .limit(1)
        )
    ).first()
    dispositivo_id = (last[0] if last and last[0] else None)

    # valida existencia
    if dispositivo_id is not None:
        from app.models.dispositivos import Dispositivo
        exists = (
            await db.execute(
                select(Dispositivo.id).where(Dispositivo.id == dispositivo_id)
            )
        ).scalar_one_or_none()
        if not exists:
            dispositivo_id = None

    return {
        "cliente_id": cen.cliente_id,
        "centro_id": cen.id,
        "dispositivo_id": dispositivo_id,
        "uuid_equipo": cen.uuid_equipo,
        "nombre": cen.nombre,
    }

# arriba del archivo (global):
_last_online_state: dict[int, bool] = {}

async def _check_and_log_transitions(db: AsyncSession, threshold_sec: int = 70):
    """Revisa last_seen de todos los centros y loguea transiciones ONLINE/OFFLINE sin necesidad de hit HTTP."""
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    ONLINE_THRESHOLD = timedelta(seconds=threshold_sec)

    q = select(Centro).order_by(Centro.nombre.asc())
    centros = (await db.execute(q)).scalars().all()

    for cen in centros:
        last_seen_dt = cen.last_seen
        if last_seen_dt and last_seen_dt.tzinfo is None:
            last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)

        if not last_seen_dt:
            online = False
            delta_s = None
        else:
            delta = now - last_seen_dt
            delta_s = delta.total_seconds()
            online = (delta <= ONLINE_THRESHOLD)

        prev = _last_online_state.get(cen.id)
        if prev is True and online is False:
            print(
                f"[monitor] {cen.uuid_equipo} OFFLINE "
                f"(delta={delta_s:.1f}s, last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )
        elif prev is False and online is True:
            print(
                f"[monitor] {cen.uuid_equipo} ONLINE "
                f"(last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )

        # Primera observación (proceso recién arrancado): loguea si ya está pasado el umbral.
        if prev is None and online is False and (delta_s is not None) and (delta_s > threshold_sec):
            print(
                f"[monitor] {cen.uuid_equipo} OFFLINE (primera observación; "
                f"delta={delta_s:.1f}s, last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )

        _last_online_state[cen.id] = online

@router.get("/status")
async def status_centros(
    db: AsyncSession = Depends(get_db),
    cliente_id: int | None = Query(None),
    threshold_sec: int = Query(70, ge=5, le=3600),
):
    
    now = datetime.now(timezone.utc)
    ONLINE_THRESHOLD = timedelta(seconds=threshold_sec)

    # 👇 este print debe verse siempre que el front/navegador llame a /status
    print(f"[status] poll now={now.isoformat()} cliente_id={cliente_id} thr={threshold_sec}s", flush=True)

    q = select(Centro)
    if cliente_id:
        q = q.where(Centro.cliente_id == cliente_id)

    centros = (await db.execute(q.order_by(Centro.nombre.asc()))).scalars().all()

    out = []
    for cen in centros:
        last_seen_dt = cen.last_seen
        if last_seen_dt and last_seen_dt.tzinfo is None:
            last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)

        if not last_seen_dt:
            online = False
            delta_s = None
        else:
            delta = now - last_seen_dt
            delta_s = delta.total_seconds()
            online = delta <= ONLINE_THRESHOLD

        prev = _last_online_state.get(cen.id)

        # transición online -> offline
        if prev is True and online is False:
            print(
                f"[status] {cen.uuid_equipo} se desconectó "
                f"(delta={delta_s:.1f}s, last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )

        # transición offline -> online
        if prev is False and online is True:
            print(
                f"[status] {cen.uuid_equipo} se reconectó "
                f"(last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )

        # primera observación: ya está offline más allá del umbral
        if prev is None and online is False and (delta_s is not None) and (delta_s > threshold_sec):
            print(
                f"[status] {cen.uuid_equipo} OFFLINE (primera observación; "
                f"delta={delta_s:.1f}s, last_seen={last_seen_dt.isoformat() if last_seen_dt else '—'})",
                flush=True
            )

        _last_online_state[cen.id] = online

        out.append({
            "id": cen.id,
            "nombre": cen.nombre,
            "uuid_equipo": cen.uuid_equipo,
            "last_seen": (
                last_seen_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                if last_seen_dt else None
            ),
            "delta": delta_s,
            "online": online,
        })

    return JSONResponse(
            {"server_now": now.isoformat(), "items": out},
            headers={"Cache-Control": "no-store, max-age=0"},
        )