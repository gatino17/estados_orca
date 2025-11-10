from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone
from app.core.config import settings


_scheduler: AsyncIOScheduler | None = None


async def disparar_capturas_08():
    # Aquí podrías crear órdenes en masa para cada dispositivo activo
    # o publicar MQTT. De momento, placeholder.
    print("[job] Disparar capturas 08:00")


def start_jobs():
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone=timezone(settings.tz))
        _scheduler.add_job(disparar_capturas_08, CronTrigger(hour=8, minute=0))
        _scheduler.start()
        print("[jobs] scheduler started", flush=True)


def stop_jobs():
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
            print("[jobs] scheduler stopped", flush=True)
        finally:
            _scheduler = None
