# app/routers/metrics.py
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.clientes import Cliente   # ajusta el import segn tu proyecto
from app.models.centros import Centro     # ajusta el import segn tu proyecto

router = APIRouter(prefix="/api/metrics", tags=["metrics"])

@router.get("/centros-por-cliente")
async def centros_por_cliente(db: AsyncSession = Depends(get_db)):
    # LEFT OUTER JOIN para incluir clientes sin centros
    stmt = (
        select(
            Cliente.id.label("cliente_id"),
            Cliente.nombre.label("cliente_nombre"),
            func.count(Centro.id).label("total_centros"),
        )
        .join(Centro, Centro.cliente_id == Cliente.id, isouter=True)
        .group_by(Cliente.id, Cliente.nombre)
        .order_by(Cliente.nombre.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = [
        {
            "cliente_id": r.cliente_id,
            "cliente_nombre": r.cliente_nombre,
            "total_centros": int(r.total_centros or 0),
        }
        for r in rows
    ]
    total_clientes = len(items)
    total_centros = sum(i["total_centros"] for i in items)
    return {"items": items, "total_clientes": total_clientes, "total_centros": total_centros}


