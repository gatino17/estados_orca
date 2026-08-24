# app/routers/ordenes.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import asyncio

from app.db.session import get_db
from app.models.ordenes import OrdenCaptura
from app.models.capturas import Captura
from app.models.centros import Centro
from app.models.dispositivos import Dispositivo  # legado (fallback)

CHILE_TZ = ZoneInfo("America/Santiago")

router = APIRouter(prefix="/api/ordenes", tags=["ordenes"])

PENDING_CAPTURE = "pendiente"
PENDING_REBOOT_PC = "pend_reinicio_pc"
PENDING_STATES = (PENDING_CAPTURE, PENDING_REBOOT_PC)

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
            OrdenCaptura.estado.in_(PENDING_STATES),
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
                OrdenCaptura.estado.in_(PENDING_STATES),
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
                OrdenCaptura.estado.in_(PENDING_STATES),
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
            tipo = "reinicio_pc" if orden.estado == PENDING_REBOOT_PC else "captura"
            return {
                "orden": {
                    "orden_id": orden.id,
                    "tipo": tipo,
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

        # Libera la conexion de BD mientras el long-poll espera.
        await db.rollback()

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


@router.post("/centro/{centro_id}/reiniciar-pc")
async def reiniciar_pc_por_centro(
    centro_id: int,
    fecha: date | None = Query(None, description="Fecha objetivo YYYY-MM-DD opcional"),
    db: AsyncSession = Depends(get_db),
):
    cen = (await db.execute(select(Centro).where(Centro.id == centro_id))).scalar_one_or_none()
    if not cen:
        raise HTTPException(status_code=404, detail="centro no encontrado")
    if not cen.uuid_equipo:
        raise HTTPException(status_code=400, detail="centro sin uuid_equipo")

    target = fecha or datetime.now(CHILE_TZ).date()

    cap = (
        await db.execute(
            select(Captura).where(
                Captura.cliente_id == cen.cliente_id,
                Captura.centro_id == cen.id,
                Captura.fecha_reporte == target,
            )
        )
    ).scalar_one_or_none()

    if not cap:
        cap = Captura(
            cliente_id=cen.cliente_id,
            centro_id=cen.id,
            dispositivo_id=None,
            fecha_reporte=target,
            estado="pendiente",
        )
        db.add(cap)
        await db.flush()

    orden = OrdenCaptura(
        captura_id=cap.id,
        estado=PENDING_REBOOT_PC,
        uuid_equipo=cen.uuid_equipo,
    )
    db.add(orden)
    await db.commit()
    await db.refresh(orden)
    created_at = orden.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return {
        "ok": True,
        "orden_id": orden.id,
        "tipo": "reinicio_pc",
        "captura_id": cap.id,
        "centro_id": cen.id,
        "uuid_equipo": cen.uuid_equipo,
        "created_at": created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if created_at else None,
    }


