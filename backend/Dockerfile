# Backend Dockerfile (FastAPI)

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Dependencias del sistema (Pillow/ReportLab, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libpng16-16 zlib1g libfreetype6 liblcms2-2 \
    libwebp7 libtiff6 libopenjp2-7 ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala requerimientos
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Copia el código
COPY backend/app ./app

# Variables útiles por defecto (se pueden sobreescribir con compose)
ENV API_TITLE="Orca Capturas API" \
    TZ="America/Santiago"

EXPOSE 8000

# Nota: usar 1 worker salvo que muevas estados/colas en memoria a Redis
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

