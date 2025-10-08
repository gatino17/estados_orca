# app/routers/dispositivos.py
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.dispositivos import Dispositivo
from app.models.centros import Centro

router = APIRouter(prefix="/api/dispositivos", tags=["dispositivos"])

@router.post("/register")
async def register(uuid_equipo: str, db: AsyncSession = Depends(get_db)):
    d = (await db.execute(select(Dispositivo).where(Dispositivo.uuid_equipo == uuid_equipo))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="dispositivo no encontrado")
    c = (await db.execute(select(Centro).where(Centro.id == d.centro_id))).scalar_one()
    return {
        "dispositivo_id": d.id,
        "centro_id": d.centro_id,
        "cliente_id": c.cliente_id,
        "capture_at": getattr(d, "capture_at", None) or "08:00",  # opcional si tienes esa columna
    }
