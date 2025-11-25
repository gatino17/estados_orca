from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, TIMESTAMP, ForeignKey, Index
from datetime import datetime
from app.db.base import Base


class OrdenCaptura(Base):
    __tablename__ = "ordenes_captura"
    __table_args__ = (
        Index("ix_ordenes_captura_captura_id", "captura_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    captura_id: Mapped[int] = mapped_column(ForeignKey("capturas.id", ondelete="CASCADE"))
    estado: Mapped[str] = mapped_column(String(20), default="pendiente") # pendiente|tomada|cancelada
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)

    uuid_equipo: Mapped[str | None] = mapped_column(String(80), index=True)
