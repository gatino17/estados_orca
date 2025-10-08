from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, TIMESTAMP
from datetime import datetime
from app.db.base import Base


class Cliente(Base):
    __tablename__ = "clientes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, default=datetime.utcnow)