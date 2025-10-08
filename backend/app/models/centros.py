from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, TIMESTAMP, ForeignKey, Text, Date, Boolean, Numeric
from datetime import datetime, date
from app.db.base import Base
from sqlalchemy import Column, DateTime


class Centro(Base):
    __tablename__ = "centros"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="CASCADE"))
    nombre: Mapped[str] = mapped_column(String(150))
    fecha_activacion: Mapped[date | None]
    cantidad_radares: Mapped[int | None]
    cantidad_camaras: Mapped[int | None]
    base_tierra: Mapped[bool | None]
    valor_contrato: Mapped[float | None] = mapped_column(Numeric(12,2))
    estado: Mapped[str] = mapped_column(String(20), default="activo")
    observacion: Mapped[str | None] = mapped_column(Text)
    grabacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)
    uuid_equipo: Mapped[str | None] = mapped_column(String(80), unique=True, index=True)
    last_seen = mapped_column(DateTime(timezone=True), nullable=True)  # UTC naive u opcional TZ-aware