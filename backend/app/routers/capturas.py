from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date, datetime, timedelta, timezone
from io import BytesIO


from app.db.session import get_db
from app.models.capturas import Captura, CapturaVersion
from app.models.ordenes import OrdenCaptura
from app.services.images import to_webp_bytes
from pydantic import BaseModel
from sqlalchemy import delete
from app.models.centros import Centro 
from app.models.dispositivos import Dispositivo


from typing import Optional


router = APIRouter(prefix="/api/capturas", tags=["capturas"])

class CapturaUpdate(BaseModel):
    fecha_reporte: Optional[date] = None
    estado: Optional[str] = None
    observacion: Optional[str] = None
    grabacion: Optional[str] = None
    dispositivo_id: Optional[int] = None 

class CapturaCreate(BaseModel):
    cliente_id: int
    centro_id: int
    dispositivo_id: Optional[int] = None
    fecha_reporte: date
    estado: Optional[str] = "pendiente"

# =========================
# SUBIR CAPTURA (acepta uuid_equipo O los IDs)
# =========================
@router.post("/upload")
async def upload_captura(
    uuid_equipo: Optional[str] = Form(None),
    cliente_id: Optional[int] = Form(None),
    centro_id: Optional[int] = Form(None),
    dispositivo_id: Optional[int] = Form(None),
    fecha_reporte: date = Form(...),
    origen: str = Form("auto"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # 👉 LOG de depuración para confirmar qué llegó
    print(f"[upload] form: uuid={uuid_equipo!r} cliente_id={cliente_id} centro_id={centro_id} disp_id={dispositivo_id} fecha={fecha_reporte} origen={origen}", flush=True)

    # 0) Resolver por UUID si viene
    if uuid_equipo:
        cen = (
            await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))
        ).scalar_one_or_none()
        if not cen:
            raise HTTPException(status_code=404, detail="centro no encontrado para uuid_equipo")

        # Consistencia si además mandaron IDs
        if cliente_id and cliente_id != cen.cliente_id:
            raise HTTPException(status_code=400, detail="cliente_id no coincide con uuid_equipo")
        if centro_id and centro_id != cen.id:
            raise HTTPException(status_code=400, detail="centro_id no coincide con uuid_equipo")

        cliente_id = cen.cliente_id
        centro_id  = cen.id

        # Resolver dispositivo_id (opcional y seguro)
        if dispositivo_id is None:
            last = (
                await db.execute(
                    select(Captura.dispositivo_id)
                    .where(Captura.centro_id == centro_id)
                    .order_by(desc(Captura.created_at))
                    .limit(1)
                )
            ).first()
            dispositivo_id = last[0] if (last and last[0] is not None) else None

        # Si tenemos un dispositivo_id, verificar que exista en tabla dispositivos.
        if dispositivo_id is not None:
            exists_disp = (
                await db.execute(select(Dispositivo.id).where(Dispositivo.id == dispositivo_id))
            ).scalar_one_or_none()
            if not exists_disp:
                # Evita romper FK: dejarlo en NULL
                print(f"[upload] dispositivo_id={dispositivo_id} no existe -> usando NULL", flush=True)
                dispositivo_id = None

    # 1) Si no vino uuid_equipo, exigir los 3 IDs (como antes)
    if not uuid_equipo and not all([cliente_id, centro_id, dispositivo_id]):
        raise HTTPException(
            status_code=400,
            detail="Faltan identificadores: envía uuid_equipo o los campos cliente_id, centro_id, dispositivo_id."
        )

    # 2) Leer/convertir imagen (igual que tenías) …
    raw = await file.read()
    bytes_, ctype, w, h, size = to_webp_bytes(raw)

    # 3) Buscar si ya existe captura del día (usa dispositivo_id que puede ser NULL y no rompe)
    captura = (
        await db.execute(
            select(Captura).where(
                Captura.centro_id == centro_id,
                Captura.dispositivo_id == dispositivo_id,
                Captura.fecha_reporte == fecha_reporte,
            )
        )
    ).scalar_one_or_none()

    if not captura:
        captura = Captura(
            cliente_id=cliente_id,
            centro_id=centro_id,
            dispositivo_id=dispositivo_id,  # <- puede ser None, y está permitido en tu modelo
            fecha_reporte=fecha_reporte,
            estado="pendiente",
        )
        db.add(captura)
        await db.flush()

    version = CapturaVersion(
        captura_id=captura.id,
        origen=origen,
        imagen_bytes=bytes_,
        content_type=ctype,
        ancho=w,
        alto=h,
        peso_bytes=size,
    )
    db.add(version)
    await db.commit()
    return {"captura_id": captura.id, "version_id": version.id}



@router.post("/{captura_id}/version")
async def subir_version_captura(
    captura_id: int,
    file: UploadFile = File(...),
    origen: str = Form("manual"),
    db: AsyncSession = Depends(get_db),
):
    cap = (
        await db.execute(select(Captura).where(Captura.id == captura_id))
    ).scalar_one_or_none()
    if not cap:
        raise HTTPException(status_code=404, detail="captura no encontrada")

    raw = await file.read()
    bytes_, ctype, w, h, size = to_webp_bytes(raw)

    version = CapturaVersion(
        captura_id=captura_id,
        origen=origen,
        imagen_bytes=bytes_,
        content_type=ctype,
        ancho=w,
        alto=h,
        peso_bytes=size,
    )
    db.add(version)
    await db.commit()
    return {"ok": True, "version_id": version.id}


@router.post("/create")
async def crear_captura_vacia(
    payload: CapturaCreate,
    db: AsyncSession = Depends(get_db),
):
    # ¿ya existe una captura para esa combinación y fecha?
    cap = (
        await db.execute(
            select(Captura).where(
                Captura.cliente_id == payload.cliente_id,
                Captura.centro_id == payload.centro_id,
                Captura.dispositivo_id == payload.dispositivo_id,
                Captura.fecha_reporte == payload.fecha_reporte,
            )
        )
    ).scalar_one_or_none()

    if not cap:
        cap = Captura(
            cliente_id=payload.cliente_id,
            centro_id=payload.centro_id,
            dispositivo_id=payload.dispositivo_id,
            fecha_reporte=payload.fecha_reporte,
            estado=payload.estado or "pendiente",
        )
        db.add(cap)
        await db.commit()
        await db.refresh(cap)

    return {
        "id": cap.id,
        "cliente_id": cap.cliente_id,
        "centro_id": cap.centro_id,
        "dispositivo_id": cap.dispositivo_id,
        "fecha_reporte": str(cap.fecha_reporte),
        "estado": cap.estado,
    }

# =========================
# RETOMAR (con FECHA opcional)
# =========================
@router.post("/{captura_id}/retomar")
async def retomar_captura(
    captura_id: int,
    fecha: date | None = Query(None, description="Fecha objetivo YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    # 1) Captura base
    base = (
        await db.execute(select(Captura).where(Captura.id == captura_id))
    ).scalar_one_or_none()
    if not base:
        raise HTTPException(status_code=404, detail="captura no encontrada")

    target = fecha or date.today()

    # 2) Buscar/crear captura para esa fecha (mismo cliente/centro/dispositivo)
    same = (
        await db.execute(
            select(Captura).where(
                Captura.cliente_id == base.cliente_id,
                Captura.centro_id == base.centro_id,
                Captura.dispositivo_id == base.dispositivo_id,
                Captura.fecha_reporte == target,
            )
        )
    ).scalar_one_or_none()

    if not same:
        same = Captura(
            cliente_id=base.cliente_id,
            centro_id=base.centro_id,
            dispositivo_id=base.dispositivo_id,
            fecha_reporte=target,
            estado="pendiente",
        )
        db.add(same)
        await db.flush()

    # 3) Crear orden apuntando a la captura de esa fecha
# ⚠️ NUEVO: traer uuid_equipo desde el centro de esta captura
    uuid_equipo = (
        await db.execute(
            select(Centro.uuid_equipo).where(Centro.id == same.centro_id)
        )
    ).scalar_one_or_none()


    orden = OrdenCaptura(
        captura_id=same.id,
        estado="pendiente",
        uuid_equipo=uuid_equipo  # 👈 clave para direccionar al agente correcto
          )
    db.add(orden)

    await db.commit()

    return {
        "ok": True,
        "orden_id": orden.id,
        "captura_id": same.id,
        "fecha_reporte": str(target),
    }

# =========================
# RETOMAR por centro (con FECHA opcional)
# =========================

@router.post("/centro/{centro_id}/retomar")
async def retomar_por_centro(
    centro_id: int,
    fecha: date | None = Query(None, description="Fecha objetivo YYYY-MM-DD"),
    dispositivo_id: int | None = Query(None, description="Si no se envía, usa el último dispositivo usado por el centro o 1"),
    db: AsyncSession = Depends(get_db),
):
    # 1) Centro existe
    cen = (await db.execute(select(Centro).where(Centro.id == centro_id))).scalar_one_or_none()
    if not cen:
        raise HTTPException(status_code=404, detail="centro no encontrado")

    target = fecha or date.today()

    # 2) Resolver dispositivo_id si no viene
    if dispositivo_id is None:
        last_cap = (
            await db.execute(
                select(Captura.dispositivo_id)
                .where(Captura.centro_id == centro_id)
                .order_by(desc(Captura.created_at))
                .limit(1)
            )
        ).first()
        dispositivo_id = (last_cap[0] if last_cap and last_cap[0] else None)

    # ✅ si tenemos un id, verifica que exista realmente en dispositivos
    if dispositivo_id is not None:
        from app.models.dispositivos import Dispositivo
        exists = (
            await db.execute(
                select(Dispositivo.id).where(Dispositivo.id == dispositivo_id)
            )
        ).scalar_one_or_none()
        if not exists:
            dispositivo_id = None  # ← no existe, deja NULL

    # 3) Buscar/crear la captura del día para ese centro+dispositivo
    cap = (
        await db.execute(
            select(Captura).where(
                Captura.cliente_id == cen.cliente_id,
                Captura.centro_id == cen.id,
                Captura.dispositivo_id == dispositivo_id,
                Captura.fecha_reporte == target,
            )
        )
    ).scalar_one_or_none()

    if not cap:
        cap = Captura(
            cliente_id=cen.cliente_id,
            centro_id=cen.id,
            dispositivo_id=dispositivo_id,
            fecha_reporte=target,
            estado="pendiente",
        )
        db.add(cap)
        await db.flush()

    # 4) Crear la orden hacia el agente
    orden = OrdenCaptura(
        captura_id=cap.id,
        estado="pendiente",
        uuid_equipo=cen.uuid_equipo # 👈 usa el del centro
                        )
    db.add(orden)

    await db.commit()

    return {
        "ok": True,
        "orden_id": orden.id,
        "captura_id": cap.id,
        "fecha_reporte": str(target),
    }



# =========================
# LISTAR CAPTURAS
# =========================
@router.get("")
async def listar_capturas(
    cliente_id: int | None = None,
    centro_id: int | None = None,
    fecha: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not cliente_id:
        return []

    # 1) Todos los centros del cliente (y opcional filtro por centro)
    q_centros = select(Centro).where(Centro.cliente_id == cliente_id)
    if centro_id:
        q_centros = q_centros.where(Centro.id == centro_id)

    res_centros = await db.execute(q_centros.order_by(Centro.nombre.asc()))
    centros = res_centros.scalars().all()

    target = fecha or date.today()
    now = datetime.now(timezone.utc)
    ONLINE_THRESHOLD = timedelta(seconds=50)

    out = []

    # 2) Para cada centro, buscar la captura del día (si existe)
    for cen in centros:
        cap = (
            await db.execute(
                select(Captura)
                .where(
                    Captura.centro_id == cen.id,
                    Captura.fecha_reporte == target
                )
                .order_by(desc(Captura.created_at))
                .limit(1)
            )
        ).scalar_one_or_none()

        captura_id = None
        dispositivo_id = None
        estado = "sin_reporte"
        ultima_url = None

        # obs/grab: tomar de CAPTURA si existen, si no, de CENTRO
        obs = cen.observacion
        grab = cen.grabacion

        if cap:
            captura_id = cap.id
            dispositivo_id = cap.dispositivo_id
            estado = cap.estado or "pendiente"

            if getattr(cap, "observacion", None) not in (None, ""):
                obs = cap.observacion
            if getattr(cap, "grabacion", None) not in (None, ""):
                grab = cap.grabacion

            v = (
                await db.execute(
                    select(CapturaVersion.id)
                    .where(CapturaVersion.captura_id == cap.id)
                    .order_by(desc(CapturaVersion.tomada_en))
                    .limit(1)
                )
            ).scalar_one_or_none()
            if v:
                ultima_url = f"/api/capturas/{cap.id}/ultima/image"

        # NUEVO: calcular last_seen + online
        last_seen_dt = getattr(cen, "last_seen", None)
        last_seen_iso = last_seen_dt.isoformat() if last_seen_dt else None        
        online = bool(last_seen_dt and (now - last_seen_dt) <= ONLINE_THRESHOLD)

        if last_seen_dt:
            # 👇 solo depuración
            print(f"[listar] {cen.uuid_equipo} last_seen={last_seen_dt} now={now} delta={(now - last_seen_dt).total_seconds():.1f}s online={online}", flush=True)

        out.append({
            "id": captura_id,                 # None si no hay captura aún
            "cliente_id": cen.cliente_id,
            "centro_id": cen.id,
            "nombre": cen.nombre,
            "uuid_equipo": getattr(cen, "uuid_equipo", None),
            "last_seen": last_seen_iso,       # 👈 NUEVO
            "online": online,                 # 👈 NUEVO (true/false)
            "observacion": obs,
            "grabacion": grab,
            "dispositivo_id": dispositivo_id,
            "fecha_reporte": str(target),
            "estado": estado,                 # "sin_reporte" si no hay captura
            "ultima_imagen_url": ultima_url,  # None si no hay imagen
        })

    return out





# =========================
# ESTADO (para polling opcional)
# =========================
@router.get("/{captura_id}/estado")
async def estado_captura(captura_id: int, db: AsyncSession = Depends(get_db)):
    # última version id + timestamp
    res = await db.execute(
        select(
            CapturaVersion.id.label("ultima_version_id"),
            CapturaVersion.tomada_en.label("tomada_en"),
        )
        .where(CapturaVersion.captura_id == captura_id)
        .order_by(desc(CapturaVersion.tomada_en))
        .limit(1)
    )
    row = res.mappings().first()  # <<< clave: devolver dict-like

    if not row:
        return {"ultima_version_id": None, "tomada_en": None}

    return {
        "ultima_version_id": row["ultima_version_id"],
        "tomada_en": row["tomada_en"].isoformat() if row["tomada_en"] else None,
    }

# =========================
# OBTENER IMAGEN POR VERSION
# =========================
@router.get("/version/{version_id}/image")
async def get_version_image(version_id: int, db: AsyncSession = Depends(get_db)):
    v = (
        await db.execute(
            select(CapturaVersion).where(CapturaVersion.id == version_id)
        )
    ).scalar_one_or_none()
    if not v or not v.imagen_bytes:
        raise HTTPException(status_code=404, detail="sin imagen")
    return StreamingResponse(
        BytesIO(v.imagen_bytes),
        media_type=v.content_type or "image/webp",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


# =========================
# OBTENER ULTIMA IMAGEN DE UNA CAPTURA
# =========================
@router.get("/{captura_id}/ultima/image")
async def get_ultima_image(captura_id: int, db: AsyncSession = Depends(get_db)):
    v = (
        await db.execute(
            select(CapturaVersion)
            .where(CapturaVersion.captura_id == captura_id)
            .order_by(desc(CapturaVersion.tomada_en))
            .limit(1)
        )
    ).scalar_one_or_none()

    if not v or not v.imagen_bytes:
        raise HTTPException(status_code=404, detail="sin imagen")

    return StreamingResponse(
        BytesIO(v.imagen_bytes),
        media_type=v.content_type or "image/webp",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.patch("/{captura_id}")
async def actualizar_captura(
    captura_id: int,
    payload: CapturaUpdate,
    db: AsyncSession = Depends(get_db),
):
    cap = (await db.execute(select(Captura).where(Captura.id == captura_id))).scalar_one_or_none()
    if not cap:
        raise HTTPException(status_code=404, detail="captura no encontrada")

    if payload.fecha_reporte is not None:
        cap.fecha_reporte = payload.fecha_reporte
    if payload.estado is not None:
        cap.estado = payload.estado
    if payload.observacion is not None:
        cap.observacion = payload.observacion
    if payload.grabacion is not None:
        cap.grabacion = payload.grabacion
    if payload.dispositivo_id is not None:         # 👈 faltaba aplicar el cambio
        cap.dispositivo_id = payload.dispositivo_id

    await db.commit()
    await db.refresh(cap)
    return {
        "id": cap.id,
        "cliente_id": cap.cliente_id,
        "centro_id": cap.centro_id,
        "dispositivo_id": cap.dispositivo_id,
        "fecha_reporte": str(cap.fecha_reporte),
        "estado": cap.estado,
        "observacion": cap.observacion,
        "grabacion": cap.grabacion,
        "ultima_imagen_url": f"/api/capturas/{cap.id}/ultima/image",
    }


@router.delete("/{captura_id}")
async def eliminar_captura(
    captura_id: int,
    db: AsyncSession = Depends(get_db),
):
    cap = (await db.execute(select(Captura).where(Captura.id == captura_id))).scalar_one_or_none()
    if not cap:
        raise HTTPException(status_code=404, detail="captura no encontrada")

    # Eliminamos versiones explícitamente por si el FK no tiene ON DELETE CASCADE
    await db.execute(delete(CapturaVersion).where(CapturaVersion.captura_id == captura_id))
    await db.delete(cap)
    await db.commit()
    return {"ok": True}