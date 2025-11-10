# Despliegue con Docker

Servicios:
- backend: FastAPI (puerto 8000)
- frontend: Vite + Nginx (puerto 8080)
- db (opcional): Postgres 16 (puerto 5432)

## 1) Variables de entorno

Copiar los ejemplos y ajustar:

```
cp env/.backend.env.example env/.backend.env
cp env/.frontend.env.example env/.frontend.env
```

Editar `env/.backend.env`:
- `DATABASE_URL` → tu cadena Postgres
- `ALLOWED_ORIGINS` → dominios del frontend

Editar `env/.frontend.env`:
- `VITE_API_BASE` → URL pública del backend

## 2) Construir y levantar

```
VITE_API_BASE=$(grep VITE_API_BASE env/.frontend.env | cut -d'=' -f2)
docker compose build --build-arg VITE_API_BASE=$VITE_API_BASE
docker compose up -d
```

El frontend quedará en `http://localhost:8080` y el backend en `http://localhost:8000`.

## 3) Notas de producción

- Usa un proxy inverso (Nginx/Caddy/Traefik) con TLS delante del frontend.
- Define `ALLOWED_ORIGINS` en backend para coincidir con tu dominio.
- Si necesitas múltiples workers/instancias del backend, mueve `netio_*` a Redis o ejecuta con `--workers 1` (ya configurado por defecto).
- Para base de datos externa, elimina el servicio `db` y ajusta `DATABASE_URL`.

