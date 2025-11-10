from pydantic import BaseModel
from dotenv import load_dotenv
import os


load_dotenv()


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/db")
    api_title: str = os.getenv("API_TITLE", "Orca Capturas API")
    tz: str = os.getenv("TZ", "America/Santiago")
    allowed_origins: list[str] = []

    def __init__(self, **data):
        super().__init__(**data)
        cors = os.getenv("ALLOWED_ORIGINS", "")
        if cors:
            self.allowed_origins = [x.strip() for x in cors.split(",") if x.strip()]


settings = Settings()
