from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path


from app.db.session import get_db
from app.models.capturas import Captura, CapturaVersion
from app.models.ordenes import OrdenCaptura
from app.services.images import to_webp_bytes
from pydantic import BaseModel
from sqlalchemy import delete
from app.models.centros import Centro 
from app.models.dispositivos import Dispositivo


from typing import Optional
# Cache simple en disco para thumbs: static/thumbs/{version_id}-w{max_w}-q{quality}.webp
THUMB_DIR = Path(__file__).resolve().parent.parent / "static" / "thumbs"
THUMB_DIR.mkdir(parents=True, exist_ok=True)

def _save_thumb(version_id: int, raw_bytes: bytes, max_w: int = 360, quality: int = 70) -> Path | None:
    """Genera y guarda miniatura en disco para reutilizarla."""
    cache_path = THUMB_DIR / f"thumb_v{version_id}_w{max_w}_q{quality}.webp"
    try:
        from PIL import Image
        import io

        img = Image.open(BytesIO(raw_bytes))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        w, h = img.size
        if w > max_w:
            scale = max_w / float(w)
            img = img.resize((int(w * scale), int(h * scale)))

        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)
        cache_path.write_bytes(out.getvalue())
        return cache_path
    except Exception as e:
        try:
            cache_path.write_bytes(raw_bytes)
            return cache_path
        except Exception as e2:
            print(f"[thumb-pre] WARNING v_id={version_id} no se pudo escribir thumb: {e!r} / {e2!r}", flush=True)
            return None


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
    # ­ƒæë LOG de depuraci├│n para confirmar qu├® lleg├│
    print(f"[upload] form: uuid={uuid_equipo!r} cliente_id={cliente_id} centro_id={centro_id} disp_id={dispositivo_id} fecha={fecha_reporte} origen={origen}", flush=True)

    # 0) Resolver por UUID si viene
    if uuid_equipo:
        cen = (
            await db.execute(select(Centro).where(Centro.uuid_equipo == uuid_equipo))
        ).scalar_one_or_none()
        if not cen:
            raise HTTPException(status_code=404, detail="centro no encontrado para uuid_equipo")

        # Consistencia si adem├ís mandaron IDs
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
            detail="Faltan identificadores: env├¡a uuid_equipo o los campos cliente_id, centro_id, dispositivo_id."
        )

    # 2) Leer/convertir imagen (igual que ten├¡as) ÔÇª
    raw = await file.read()
    bytes_, ctype, w, h, size = to_webp_bytes(raw)

    # 3) Buscar si ya existe captura del d├¡a (usa dispositivo_id que puede ser NULL y no rompe)
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
            dispositivo_id=dispositivo_id,  # <- puede ser None, y est├í permitido en tu modelo
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
    await db.refresh(version)
    _save_thumb(version.id, bytes_, max_w=360, quality=70)
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
    await db.refresh(version)
    _save_thumb(version.id, bytes_, max_w=360, quality=70)
    return {"ok": True, "version_id": version.id}


@router.post("/create")
async def crear_captura_vacia(
    payload: CapturaCreate,
    db: AsyncSession = Depends(get_db),
):
    # ┬┐ya existe una captura para esa combinaci├│n y fecha?
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
# ÔÜá´©Å NUEVO: traer uuid_equipo desde el centro de esta captura
    uuid_equipo = (
        await db.execute(
            select(Centro.uuid_equipo).where(Centro.id == same.centro_id)
        )
    ).scalar_one_or_none()


    orden = OrdenCaptura(
        captura_id=same.id,
        estado="pendiente",
        uuid_equipo=uuid_equipo  # ­ƒæê clave para direccionar al agente correcto
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
    dispositivo_id: int | None = Query(None, description="Si no se env├¡a, usa el ├║ltimo dispositivo usado por el centro o 1"),
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

    # Ô£à si tenemos un id, verifica que exista realmente en dispositivos
    if dispositivo_id is not None:
        from app.models.dispositivos import Dispositivo
        exists = (
            await db.execute(
                select(Dispositivo.id).where(Dispositivo.id == dispositivo_id)
            )
        ).scalar_one_or_none()
        if not exists:
            dispositivo_id = None  # ÔåÉ no existe, deja NULL

    # 3) Buscar/crear la captura del d├¡a para ese centro+dispositivo
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
        uuid_equipo=cen.uuid_equipo # ­ƒæê usa el del centro
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
# LISTAR CAPTURAS (paginado y sin N+1)
# =========================
@router.get("")
async def listar_capturas(
    cliente_id: int | None = Query(None),
    centro_id: int | None = Query(None),
    fecha: date | None = Query(None, description="Fecha objetivo YYYY-MM-DD"),
    page: int = Query(1, ge=1, description="Pagina (1-indexada)"),
    page_size: int = Query(15, ge=1, le=100, description="Filas por pagina"),
    estado: str | None = Query(None, description="Filtrar por estado exacto (case-insensitive)"),
    online: bool | None = Query(None, description="Filtrar por estado online calculado"),
    threshold_sec: int = Query(50, ge=5, le=3600, description="Umbral de online en segundos"),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve filas paginadas (una por centro) con la ultima captura del dia y su ultima version.
    Incluye online/last_seen calculado en el backend para evitar N+1 y doble polling en el front.
    """
    if not cliente_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    target = fecha or date.today()
    now = datetime.now(timezone.utc)
    ONLINE_THRESHOLD = timedelta(seconds=threshold_sec)

    cap_sq = (
        select(
            Captura.id.label("cap_id"),
            Captura.centro_id.label("cap_centro_id"),
            Captura.dispositivo_id.label("cap_dispositivo_id"),
            Captura.estado.label("cap_estado"),
            Captura.observacion.label("cap_observacion"),
            Captura.grabacion.label("cap_grabacion"),
            Captura.fecha_reporte.label("cap_fecha"),
            func.row_number()
            .over(partition_by=Captura.centro_id, order_by=Captura.created_at.desc())
            .label("rn"),
        )
        .where(Captura.fecha_reporte == target)
    ).subquery()

    ver_sq = (
        select(
            CapturaVersion.id.label("ver_id"),
            CapturaVersion.captura_id.label("ver_captura_id"),
            CapturaVersion.tomada_en.label("ver_tomada_en"),
            func.row_number()
            .over(partition_by=CapturaVersion.captura_id, order_by=CapturaVersion.tomada_en.desc())
            .label("rn"),
        )
    ).subquery()

    base = (
        select(
            Centro.id.label("centro_id"),
            Centro.cliente_id.label("cliente_id"),
            Centro.nombre.label("centro_nombre"),
            Centro.uuid_equipo.label("uuid_equipo"),
            Centro.observacion.label("centro_observacion"),
            Centro.grabacion.label("centro_grabacion"),
            Centro.last_seen.label("last_seen"),
            cap_sq.c.cap_id,
            cap_sq.c.cap_dispositivo_id,
            cap_sq.c.cap_estado,
            cap_sq.c.cap_observacion,
            cap_sq.c.cap_grabacion,
            cap_sq.c.cap_fecha,
            ver_sq.c.ver_id,
            ver_sq.c.ver_tomada_en,
        )
        .join(cap_sq, and_(cap_sq.c.cap_centro_id == Centro.id, cap_sq.c.rn == 1), isouter=True)
        .join(ver_sq, and_(ver_sq.c.ver_captura_id == cap_sq.c.cap_id, ver_sq.c.rn == 1), isouter=True)
        .where(Centro.cliente_id == cliente_id)
    )

    if centro_id:
        base = base.where(Centro.id == centro_id)

    if estado:
        base = base.where(func.lower(cap_sq.c.cap_estado) == estado.lower())

    if online is not None:
        limit_dt = now - ONLINE_THRESHOLD
        if online:
            base = base.where(and_(Centro.last_seen.is_not(None), Centro.last_seen >= limit_dt))
        else:
            base = base.where(or_(Centro.last_seen.is_(None), Centro.last_seen < limit_dt))

    subq = base.subquery()
    total_res = await db.execute(select(func.count()).select_from(subq))
    total = int(total_res.scalar_one() or 0)

    # conteo de centros sin imagen (ultima_version_id es null)
    sin_img_res = await db.execute(
        select(func.count()).select_from(subq).where(subq.c.ver_id.is_(None))
    )
    total_sin_imagen = int(sin_img_res.scalar_one() or 0)

    # listado de nombres (limitado) sin imagen
    missing_res = await db.execute(
        select(subq.c.centro_id, subq.c.centro_nombre)
        .where(subq.c.ver_id.is_(None))
        .order_by(subq.c.centro_nombre.asc())
        .limit(80)
    )
    missing_names = [
        row.centro_nombre or f"Centro {row.centro_id}"
        for row in missing_res
    ]

    offset = max(0, (page - 1) * page_size)

    rows = (
        await db.execute(
            base.order_by(Centro.nombre.asc(), Centro.id.asc()).offset(offset).limit(page_size)
        )
    ).mappings().all()

    items = []
    for r in rows:
        last_seen_dt = r["last_seen"]
        online_flag = bool(last_seen_dt and (now - last_seen_dt) <= ONLINE_THRESHOLD)
        obs = r["cap_observacion"] if r["cap_observacion"] not in (None, "") else r["centro_observacion"]
        grab = r["cap_grabacion"] if r["cap_grabacion"] not in (None, "") else r["centro_grabacion"]
        cap_id = r["cap_id"]
        ver_id = r["ver_id"]

        if cap_id:
            estado_val = r["cap_estado"] or "pendiente"
            fecha_val = r["cap_fecha"] or target
        else:
            estado_val = "sin_reporte"
            fecha_val = target

        items.append({
            "id": cap_id,
            "cliente_id": r["cliente_id"],
            "centro_id": r["centro_id"],
            "nombre": r["centro_nombre"],
            "uuid_equipo": r["uuid_equipo"],
            "last_seen": last_seen_dt.isoformat() if last_seen_dt else None,
            "online": online_flag,
            "observacion": obs,
            "grabacion": grab,
            "dispositivo_id": r["cap_dispositivo_id"],
            "fecha_reporte": str(fecha_val),
            "estado": estado_val,
            "ultima_version_id": ver_id,
            "ultima_imagen_url": f"/api/capturas/{cap_id}/ultima/image" if (cap_id and ver_id) else None,
        })

    total_pages = max(1, (total + page_size - 1) // page_size) if page_size else 1

    return {
        "items": items,
        "total": total,
        "total_sin_imagen": total_sin_imagen,
        "sin_imagen_nombres": missing_names,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }





# =========================
# ESTADO (para polling opcional)
# =========================
@router.get("/{captura_id}/estado")
async def estado_captura(captura_id: int, db: AsyncSession = Depends(get_db)):
    # ├║ltima version id + timestamp
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
# OBTENER MINIATURA OPTIMIZADA (con ETag/304)
# =========================
@router.get("/{captura_id}/ultima/thumb")
async def get_ultima_thumb(
    request: Request,
    captura_id: int,
    max_w: int = Query(360, ge=64, le=1920),
    quality: int = Query(70, ge=40, le=95),
    db: AsyncSession = Depends(get_db),
):
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

    etag = f'W/"capv-{v.id}-w{max_w}-q{quality}"'
    inm = request.headers.get("if-none-match")
    if inm and inm == etag:
        return Response(status_code=304)

    # path en disco para cache persistente
    cache_path = THUMB_DIR / f"thumb_v{v.id}_w{max_w}_q{quality}.webp"
    if cache_path.exists():
        data = cache_path.read_bytes()
        headers = {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=120",
            "ETag": etag,
        }
        return Response(content=data, media_type="image/webp", headers=headers)

    try:
        from PIL import Image
        import io

        img = Image.open(BytesIO(v.imagen_bytes))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        w, h = img.size
        if w > max_w:
            scale = max_w / float(w)
            img = img.resize((int(w * scale), int(h * scale)))

        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)
        data = out.getvalue()
        media_type = "image/webp"
    except Exception as e:
        print(f"[thumb] WARNING captura_id={captura_id} fallback original: {e!r}", flush=True)
        data = v.imagen_bytes
        media_type = v.content_type or "application/octet-stream"

    # Guardar en disco para reutilizar
    try:
        cache_path.write_bytes(data)
    except Exception as e:
        print(f"[thumb] WARNING no se pudo escribir cache {cache_path}: {e!r}", flush=True)

    headers = {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=120",
        "ETag": etag,
    }
    return Response(content=data, media_type=media_type, headers=headers)


# =========================
# OBTENER ULTIMA IMAGEN DE UNA CAPTURA
# =========================
@router.get("/{captura_id}/ultima/image")
async def get_ultima_image(request: Request, captura_id: int, db: AsyncSession = Depends(get_db)):
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

    # ETag basada en version-id para permitir 304
    etag = f"W/\"capv-{v.id}-full\""
    inm = request.headers.get("if-none-match")
    if inm and inm == etag:
        return Response(status_code=304)

    headers = {
        # cache corto; los cambios de versi├│n invalidan por ETag
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
        "ETag": etag,
    }
    return Response(content=v.imagen_bytes, media_type=v.content_type or "image/webp", headers=headers)


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
    if payload.dispositivo_id is not None:         # ­ƒæê faltaba aplicar el cambio
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

    # Eliminamos versiones expl├¡citamente por si el FK no tiene ON DELETE CASCADE
    await db.execute(delete(CapturaVersion).where(CapturaVersion.captura_id == captura_id))
    await db.delete(cap)
    await db.commit()
    return {"ok": True}

