from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone
from app.core.config import settings


scheduler = AsyncIOScheduler(timezone=timezone(settings.tz))


async def disparar_capturas_08():
    # Aquí podrías crear órdenes en masa para cada dispositivo activo
    # o publicar MQTT. De momento, placeholder.
    print("[job] Disparar capturas 08:00")


def start_jobs():
    scheduler.add_job(disparar_capturas_08, CronTrigger(hour=8, minute=0))
    scheduler.start()