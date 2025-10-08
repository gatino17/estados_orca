# app/routers/ordenes.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import asyncio

from app.db.session import get_db
from app.models.ordenes import OrdenCaptura
from app.models.capturas import Captura
from app.models.centros import Centro
from app.models.dispositivos import Dispositivo  # legado (fallback)

CHILE_TZ = ZoneInfo("America/Santiago")

router = APIRouter(prefix="/api/ordenes", tags=["ordenes"])

async def _find_pending_order_by_uuid(
    db: AsyncSession, uuid_equipo: str
) -> tuple[OrdenCaptura, Captura] | None:
    """
    1) Ruta nueva: buscar ordenes pendientes por OrdenCaptura.uuid_equipo.
    2) Fallback legado: si no hay, intenta resolver centro/dispositivo y buscar por captura.
    """
    # 1) NUEVO: órdenes que ya traen uuid_equipo
    q1 = (
        select(OrdenCaptura, Captura)
        .join(Captura, Captura.id == OrdenCaptura.captura_id)
        .where(
            OrdenCaptura.estado == "pendiente",
            OrdenCaptura.uuid_equipo == uuid_equipo,
        )
        .order_by(OrdenCaptura.created_at.asc())
        .limit(1)
    )
    row = (await db.execute(q1)).first()
    if row:
        return row  # (orden, cap)

    # 2) LEGADO #1: si hay centro con ese uuid_equipo, buscar órdenes pendientes cuya captura sea de ese centro
    cen = (await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))).scalar_one_or_none()
    if cen:
        q2 = (
            select(OrdenCaptura, Captura)
            .join(Captura, Captura.id == OrdenCaptura.captura_id)
            .where(
                OrdenCaptura.estado == "pendiente",
                Captura.centro_id == cen.id,
            )
            .order_by(OrdenCaptura.created_at.asc())
            .limit(1)
        )
        row = (await db.execute(q2)).first()
        if row:
            return row

    # 3) LEGADO #2: camino original por dispositivos (si aún los usas)
    d = (await db.execute(select(Dispositivo).where(Dispositivo.uuid_equipo == uuid_equipo))).scalar_one_or_none()
    if d:
        q3 = (
            select(OrdenCaptura, Captura)
            .join(Captura, Captura.id == OrdenCaptura.captura_id)
            .where(
                OrdenCaptura.estado == "pendiente",
                Captura.dispositivo_id == d.id,
            )
            .order_by(OrdenCaptura.created_at.asc())
            .limit(1)
        )
        row = (await db.execute(q3)).first()
        if row:
            return row

    return None


@router.get("/pull")
async def pull_orden(
    uuid_equipo: str = Query(..., description="Identificador único del agente/equipo"),
    wait: int = Query(0, ge=0, le=60, description="Segundos de long-poll (0-60)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Long-poll: intenta hasta `wait` segundos (durmiendo de a 1s) para encontrar
    una orden pendiente para `uuid_equipo`. Primero intenta por OrdenCaptura.uuid_equipo,
    luego hace fallbacks compatibles con el comportamiento anterior.

    ➕ También actualiza Centro.last_seen cada vez que el agente hace pull.
    """

    # ⬇️⬇️⬇️ NUEVO: comprobar si el centro existe; si no, cortar con 410
    cen = (await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))).scalar_one_or_none()
    if not cen:
        # el centro fue eliminado o no existe para ese UUID
        raise HTTPException(status_code=410, detail="centro eliminado para este uuid_equipo")
    # ⬆️⬆️⬆️

    # Actualizar last_seen al inicio del pull
    cen.last_seen = datetime.now(timezone.utc)
    await db.commit()

    # (log opcional)
    try:
        print(
            f"[pull] last_seen actualizado para {uuid_equipo} -> "
            f"UTC={cen.last_seen.isoformat()}  "
            f"LOCAL={cen.last_seen.astimezone(CHILE_TZ).isoformat()}",
            flush=True
        )
    except Exception:
        pass

    deadline = datetime.now(timezone.utc) + timedelta(seconds=wait or 0)

    while True:
        row = await _find_pending_order_by_uuid(db, uuid_equipo)
        if row:
            orden, cap = row
            return {
                "orden": {
                    "orden_id": orden.id,
                    "captura_id": cap.id,
                    "cliente_id": cap.cliente_id,
                    "centro_id": cap.centro_id,
                    "dispositivo_id": cap.dispositivo_id,
                    "fecha_reporte": str(cap.fecha_reporte),
                    "uuid_equipo": uuid_equipo,  # debug
                }
            }

        # sin orden
        if wait <= 0 or datetime.now(timezone.utc) >= deadline:
            return {"orden": None}

        # dormir ~1s y reintentar
        await asyncio.sleep(1.0)




@router.post("/{orden_id}/ack")
async def ack_orden(orden_id: int, db: AsyncSession = Depends(get_db)):
    orden = (await db.execute(select(OrdenCaptura).where(OrdenCaptura.id == orden_id))).scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="orden no encontrada")
    orden.estado = "tomada"
    await db.commit()
    return {"ok": True}


