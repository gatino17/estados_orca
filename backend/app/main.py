from fastapi import FastAPI
import asyncio
from app.core.config import settings
from app.routers import (
    health,
    capturas,
    ordenes,
    clientes,
    dispositivos,
    centros,
    reportes,
    users,
    metrics,
)
from app.routers import netio_status, netio_actions
from app.jobs.scheduler import start_jobs
import app.models
from contextlib import suppress
from app.db.session import get_db
from app.routers import centros as centros_router 

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title=settings.api_title)

# 👇 Añade este bloque
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # en producción limita a tu dominio (ej. ["https://tusitio.com"])
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(clientes.router)
app.include_router(capturas.router)
app.include_router(ordenes.router)
app.include_router(dispositivos.router)
app.include_router(centros.router)
app.include_router(reportes.router)
app.include_router(users.router)
app.include_router(netio_status.router)
app.include_router(netio_actions.router)
app.include_router(metrics.router)

# Jobs (opcional)
start_jobs()

async def _monitor_loop(threshold_sec: int = 70, interval_sec: int = 5):
    print(f"[monitor] iniciado (thr={threshold_sec}s, interval={interval_sec}s)", flush=True)
    while True:
        try:
            # abre una AsyncSession usando tu dependencia
            async for db in get_db():
                await centros_router._check_and_log_transitions(db, threshold_sec=threshold_sec)
                break
        except Exception as e:
            print(f"[monitor] ERROR: {e!r}", flush=True)
        await asyncio.sleep(interval_sec)

@app.on_event("startup")
async def _startup_monitor():
    app.state.monitor_task = asyncio.create_task(_monitor_loop(threshold_sec=70, interval_sec=5))

@app.on_event("shutdown")
async def _shutdown_monitor():
    task = getattr(app.state, "monitor_task", None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        print("[monitor] detenido", flush=True)
