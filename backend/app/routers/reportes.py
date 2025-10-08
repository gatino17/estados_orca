# routers/reportes.py
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.lib.units import cm
from PIL import Image
import io
import textwrap
import re
import requests
from pathlib import Path

from app.db.session import get_db
from app.models.centros import Centro
from app.models.capturas import Captura, CapturaVersion
from app.models.clientes import Cliente

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


def slugify_filename(s: str) -> str:
    s = s or ""
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"[^a-zA-Z0-9_\-\.]+", "", s)
    return s[:60] or "cliente"


@router.get("/reporte/pdf")
async def reporte_pdf(
    cliente_id: int = Query(...),
    fecha: date = Query(...),
    logo_url: str | None = Query(None, description="URL http(s) del banner corporativo (opcional)"),
    logo_path: str = str(Path(__file__).resolve().parent.parent / "static" / "banner.png"),
    brand: str | None = Query("ORCA TECNOLOGÍA"),
    tz: str | None = Query("America/Santiago"),
    db: AsyncSession = Depends(get_db),
):
    # === Cliente ===
    cliente_nombre = (await db.execute(
        select(Cliente.nombre).where(Cliente.id == cliente_id)
    )).scalar_one_or_none()
    if not cliente_nombre:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # === Centros/Capturas del día ===
    q_centros = select(Centro).where(Centro.cliente_id == cliente_id).order_by(Centro.nombre.asc())
    centros = (await db.execute(q_centros)).scalars().all()

    rows, con_imagen = [], 0
    for cen in centros:
        cap = (await db.execute(
            select(Captura)
            .where(Captura.centro_id == cen.id, Captura.fecha_reporte == fecha)
            .order_by(desc(Captura.created_at))
            .limit(1)
        )).scalar_one_or_none()

        estado, version = "sin_reporte", None
        obs, grab = cen.observacion or "", cen.grabacion or ""
        if cap:
            estado = cap.estado or "pendiente"
            if getattr(cap, "observacion", None) not in (None, ""):
                obs = cap.observacion
            if getattr(cap, "grabacion", None) not in (None, ""):
                grab = cap.grabacion
            version = (await db.execute(
                select(CapturaVersion)
                .where(CapturaVersion.captura_id == cap.id)
                .order_by(desc(CapturaVersion.tomada_en))
                .limit(1)
            )).scalar_one_or_none()

        if version and version.imagen_bytes:
            con_imagen += 1

        rows.append({
            "nombre": cen.nombre or f"Centro {cen.id}",
            "uuid": cen.uuid_equipo,
            "last_seen": cen.last_seen.isoformat() if cen.last_seen else None,
            "estado": estado,
            "observacion": obs,
            "grabacion": grab,
            "imagen_bytes": version.imagen_bytes if (version and version.imagen_bytes) else None,
            "content_type": version.content_type if version else None,
        })

    if not rows:
        raise HTTPException(status_code=404, detail="No hay centros para este cliente")

    total_centros = len(rows)
    sin_imagen = total_centros - con_imagen

    # === PDF ===
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    left, right = 2 * cm, W - 2 * cm
    line = H - 2 * cm

    # Colores corporativos
    CELESTE = colors.Color(0.06, 0.55, 0.93)
    CELESTE_DARK = colors.Color(0.02, 0.34, 0.62)
    CELESTE_LIGHT = colors.Color(0.85, 0.94, 0.99)

    def wrap(text: str, max_chars: int):
        text = (text or "").strip()
        return textwrap.wrap(text, width=max_chars) or [""]

    # === Banner corporativo ===
    def draw_banner():
        nonlocal line
        banner_h_max = 2.0 * cm

        if logo_url or logo_path:
            try:
                if logo_url and logo_url.lower().startswith(("http://", "https://")):
                    r = requests.get(logo_url, timeout=8)
                    r.raise_for_status()
                    img = Image.open(io.BytesIO(r.content)).convert("RGB")
                else:
                    with open(logo_path, "rb") as fh:
                        img = Image.open(io.BytesIO(fh.read())).convert("RGB")

                iw, ih = img.size

                # ancho máximo del banner: 85% del ancho útil (entre márgenes)
                banner_w_max = (right - left) * 0.85
                banner_h_max = 3.0 * cm  # ya lo tienes, lo reutilizamos

                # escala respetando ancho y alto máximos
                scale = min(banner_w_max / float(iw), banner_h_max / float(ih))
                draw_w = iw * scale
                draw_h = ih * scale

                ibytes = io.BytesIO()
                img.save(ibytes, format="JPEG", quality=92)
                ibytes.seek(0)
                # >>> AQUÍ define x según necesites <<<
                # x = left                     # izquierda
                # x = (W - draw_w) / 2      # centrado
                # x = right - draw_w        # derecha
                x = left + 7.8*cm           # ajuste fino
                # posición: alineado a la izquierda, debajo del margen superior
                banner_y = H - draw_h - 0.1 * cm   # sube/baja el banner cambiando este 0.5

                c.drawImage(ImageReader(ibytes), x, banner_y, width=draw_w, height=draw_h, mask='auto')

                # deja el cursor de texto un poco debajo del banner
                line = banner_y - 22

                return
            except Exception:
                pass

        # fallback vectorial
        grad_h, steps = 3.0 * cm, 40
        for i in range(steps):
            t = i / max(steps - 1, 1)
            r_ = CELESTE_DARK.red * (1 - t) + CELESTE.red * t
            g_ = CELESTE_DARK.green * (1 - t) + CELESTE.green * t
            b_ = CELESTE_DARK.blue * (1 - t) + CELESTE.blue * t
            c.setFillColor(colors.Color(r_, g_, b_))
            y = H - grad_h - 1 * cm + (i * grad_h / steps)
            c.rect(0, y, W, grad_h / steps + 0.5, stroke=0, fill=1)

        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(colors.white)
        c.drawString(1.5 * cm, H - 2.1 * cm, (brand or "ORCA TECNOLOGÍA"))
        line = H - grad_h - 1 * cm - 22

    # Dibuja el banner en la primera página
    draw_banner()

    # Encabezado textual
    try:
        tzinfo = ZoneInfo(tz or "America/Santiago")
    except Exception:
        tzinfo = timezone.utc
    now_local = datetime.now(tzinfo)

    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(colors.black)
    c.drawString(left, line, "Informe diario de Orca")
    line -= 18

    # Cliente en NEGRITA
    label = "Cliente: "
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, line, label)
    name_x = left + c.stringWidth(label, "Helvetica-Bold", 11) + 2
    c.drawString(name_x, line, cliente_nombre)
    line -= 14

    c.setFont("Helvetica", 10)
    c.drawString(left, line, f"Fecha del informe: {fecha.isoformat()}")
    line -= 12
    c.drawString(left, line, f"Generado: {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    line -= 14

    c.setFont("Helvetica", 10)
    c.drawString(left, line, f"Totales — Centros: {total_centros} | Con imagen: {con_imagen} | Sin imagen: {sin_imagen}")
    line -= 10
    c.setStrokeColor(colors.lightgrey)
    c.line(left, line, right, line)
    line -= 10

    # === Tabla resumen ===
    colN, colNombre, colObs, colGrab = left, left + 1.2 * cm, left + 8.1 * cm, left + 14.2 * cm
    col_end = right

    def table_header():
        nonlocal line
        c.setFillColor(CELESTE)
        c.rect(left, line - 14, col_end - left, 16, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(colN + 2, line - 11, "N°")
        c.drawString(colNombre, line - 11, "Nombre")
        c.drawString(colObs, line - 11, "Observación")
        c.drawString(colGrab, line - 11, "Grabación")
        line -= 18

    table_header()
    c.setFont("Helvetica", 9)
    zebra = [colors.white, CELESTE_LIGHT]

    for idx, r in enumerate(rows, start=1):
        obs_lines = wrap(r["observacion"], 48)
        grab_lines = wrap(r["grabacion"], 34)
        max_lines = max(len(obs_lines), len(grab_lines), 1)
        row_h = max_lines * 10 + 6

        if line - row_h < 3 * cm:
            c.showPage()
            line = H - 2 * cm
            draw_banner()
            c.setFont("Helvetica-Bold", 12)
            c.setFillColor(colors.black)
            c.drawString(left, line, "Resumen (continúa)")
            line -= 16
            table_header()
            c.setFont("Helvetica", 9)

        c.setFillColor(zebra[(idx % 2)])
        c.rect(left, line - (row_h - 2), col_end - left, row_h, stroke=0, fill=1)
        c.setFillColor(colors.black)

        c.drawString(colN + 2, line - 12, f"{idx}")
        c.drawString(colNombre, line - 12, (r["nombre"] or "")[:46])

        y = line - 12
        for ln in obs_lines:
            c.drawString(colObs, y, ln)
            y -= 10

        y2 = line - 12
        for ln in grab_lines:
            c.drawString(colGrab, y2, ln)
            y2 -= 10

        line -= row_h

    c.setStrokeColor(colors.lightgrey)
    c.line(left, line, right, line)
    line -= 20   # más espacio que antes

    # === Sección de imágenes ===
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(colors.black)
    c.drawString(left, line, "Imágenes")
    line -= 20

    max_img_w = right - left
    for idx, r in enumerate(rows, start=1):
        if line - 14 < 3 * cm:
            c.showPage()
            line = H - 2 * cm
            draw_banner()
            c.setFont("Helvetica-Bold", 12)
            c.drawString(left, line, "Imágenes (continúa)")
            line -= 16

        c.setFont("Helvetica-Bold", 10)
        c.drawString(left, line, f"Imagen #{idx} — {r['nombre']}")
        line -= 12

        if r["imagen_bytes"]:
            try:
                img = Image.open(io.BytesIO(r["imagen_bytes"])).convert("RGB")
                iw, ih = img.size
                scale = max_img_w / float(iw)
                draw_w, draw_h = max_img_w, ih * scale
                if line - (draw_h + 12) < 3 * cm:
                    c.showPage()
                    line = H - 2 * cm
                    draw_banner()
                    c.setFont("Helvetica-Bold", 10)
                    c.drawString(left, line, f"Imagen #{idx} — {r['nombre']}")
                    line -= 12
                ibytes = io.BytesIO()
                img.save(ibytes, format="JPEG", quality=90)
                ibytes.seek(0)
                c.drawImage(ImageReader(ibytes), left, line - draw_h, width=draw_w, height=draw_h, mask='auto')
                line -= (draw_h + 12)
            except Exception:
                c.setFont("Helvetica-Oblique", 9)
                c.setFillColor(colors.grey)
                c.drawString(left, line, "(No se pudo renderizar la imagen)")
                c.setFillColor(colors.black)
                line -= 12
        else:
            c.setFont("Helvetica-Oblique", 9)
            c.setFillColor(colors.grey)
            c.drawString(left, line, "(Sin imagen)")
            c.setFillColor(colors.black)
            line -= 12

        line -= 12  # más espacio entre imágenes

    c.showPage()
    c.save()
    buf.seek(0)

    safe_name = slugify_filename(cliente_nombre)
    filename = f"informe_{safe_name}_{fecha.isoformat()}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
