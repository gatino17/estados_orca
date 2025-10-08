from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.clientes import Cliente
from app.models.centros import Centro
from app.models.capturas import Captura


router = APIRouter(prefix="/api/clientes", tags=["clientes"])


class ClienteCreate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)


class ClienteUpdate(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)


def serialize(cliente: Cliente) -> dict:
    return {"id": cliente.id, "nombre": cliente.nombre}


@router.get("")
async def listar(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cliente).order_by(Cliente.id))
    return [serialize(c) for c in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def crear(payload: ClienteCreate, db: AsyncSession = Depends(get_db)):
    cliente = Cliente(nombre=payload.nombre.strip())
    db.add(cliente)
    await db.commit()
    await db.refresh(cliente)
    return serialize(cliente)


@router.put("/{cliente_id}")
async def actualizar(cliente_id: int, payload: ClienteUpdate, db: AsyncSession = Depends(get_db)):
    cliente = await db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    cliente.nombre = payload.nombre.strip()
    await db.commit()
    await db.refresh(cliente)
    return serialize(cliente)


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar(cliente_id: int, db: AsyncSession = Depends(get_db)):
    cliente = await db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    # elimina capturas y centros asociados antes de borrar el cliente
    await db.execute(delete(Captura).where(Captura.cliente_id == cliente_id))
    await db.execute(delete(Centro).where(Centro.cliente_id == cliente_id))

    await db.delete(cliente)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
