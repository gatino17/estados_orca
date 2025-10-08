from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, TIMESTAMP, ForeignKey, Boolean
from datetime import datetime
from app.db.base import Base


class Dispositivo(Base):
    __tablename__ = "dispositivos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    centro_id: Mapped[int] = mapped_column(ForeignKey("centros.id", ondelete="CASCADE"))
    nombre: Mapped[str] = mapped_column(String(100))
    tipo: Mapped[str | None] = mapped_column(String(50))
    uuid_equipo: Mapped[str | None] = mapped_column(String(100), unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)