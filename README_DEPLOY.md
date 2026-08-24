# Despliegue con Docker

Servicios:
- `backend`: FastAPI en el puerto `8000`.
- `frontend`: Vite + Nginx en el puerto `8080`.
- `db` opcional: Postgres 16 en el puerto `5432`.

## 1) Variables de entorno

Backend:
- Ajustar `DATABASE_URL` en el entorno del backend.
- Para HTTPS por dominio, usar:

```bash
ALLOWED_ORIGINS=https://estados.orcatecnologia.net
```

Frontend:
- En produccion debe quedar sin URL absoluta:

```bash
VITE_API_BASE=
```

Con `VITE_API_BASE` vacio, el navegador llama a `/api/...` en el mismo dominio HTTPS. El Nginx del frontend reenvia `/api/` al servicio Docker `backend:8000`.

## 2) Construir y levantar

En Linux:

```bash
export VITE_API_BASE=
docker compose build frontend
docker compose up -d
```

En PowerShell:

```powershell
$env:VITE_API_BASE=""
docker compose build frontend
docker compose up -d
```

El frontend queda en `http://localhost:8080` y el backend directo en `http://localhost:8000`.

## 3) HTTPS con estados.orcatecnologia.net

El dominio publico debe terminar en un proxy con TLS, por ejemplo Nginx/Caddy/Traefik. Ese proxy puede enviar todo al frontend:

```nginx
server {
    listen 80;
    server_name estados.orcatecnologia.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name estados.orcatecnologia.net;

    ssl_certificate /etc/letsencrypt/live/estados.orcatecnologia.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estados.orcatecnologia.net/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 90s;
    }
}
```

Si el proxy publico esta en otro equipo, cambiar `127.0.0.1:8080` por la IP interna del servidor Docker, por ejemplo `10.11.10.xx:8080`.

## 4) Verificaciones

```bash
curl -I https://estados.orcatecnologia.net/
curl https://estados.orcatecnologia.net/health
curl https://estados.orcatecnologia.net/api/clientes
```

`/health` y `/api/clientes` deben responder desde FastAPI, no devolver el `index.html` del frontend.

## 5) Notas de produccion

- No compilar el frontend con `VITE_API_BASE=http://179.57.170.61:8000`, porque desde HTTPS genera llamadas inseguras a HTTP.
- Mantener `--workers 1` si se usan colas o estados en memoria para Netio.
- Para base de datos externa, quitar el servicio `db` y ajustar `DATABASE_URL`.
- Cuando el HTTPS quede operativo, los agentes pueden usar `SERVER=https://estados.orcatecnologia.net`.
