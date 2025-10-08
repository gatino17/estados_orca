from datetime import datetime, date
from typing import Optional

from sqlalchemy import ForeignKey, Integer, LargeBinary, String, TIMESTAMP, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Captura(Base):
    __tablename__ = "capturas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="CASCADE"))
    centro_id: Mapped[int] = mapped_column(ForeignKey("centros.id", ondelete="CASCADE"))
    dispositivo_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dispositivos.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )
    fecha_reporte: Mapped[date]
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    observacion: Mapped[Optional[str]] = mapped_column(Text, default="sn")
    grabacion: Mapped[Optional[str]] = mapped_column(Text, default="correcto")
    notas: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)


class CapturaVersion(Base):
    __tablename__ = "captura_versiones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    captura_id: Mapped[int] = mapped_column(ForeignKey("capturas.id", ondelete="CASCADE"))
    tomada_en: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)
    origen: Mapped[str] = mapped_column(String(20), default="auto")
    imagen_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    content_type: Mapped[Optional[str]] = mapped_column(String(50))
    ancho: Mapped[Optional[int]]
    alto: Mapped[Optional[int]]
    peso_bytes: Mapped[Optional[int]]
    imagen_url: Mapped[Optional[str]]
    thumbnail_url: Mapped[Optional[str]]
