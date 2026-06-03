# Monkeypatch redis-py to default to protocol=3 (RESP3) to resolve RESP3 parsing/null compatibility errors with fakeredis TcpFakeServer
try:
    import redis.connection

    _original_abstract_init = redis.connection.AbstractConnection.__init__

    def _patched_abstract_init(self, *args, **kwargs):
        if "protocol" not in kwargs or kwargs["protocol"] is None:
            kwargs["protocol"] = 3
        _original_abstract_init(self, *args, **kwargs)

    redis.connection.AbstractConnection.__init__ = _patched_abstract_init
except Exception:
    pass

import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print(f"CORE_CELERY_APP: backend_dir is {backend_dir}")
sys.stdout.flush()
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
    print(f"CORE_CELERY_APP: Added {backend_dir} to sys.path")
    sys.stdout.flush()

from celery import Celery  # noqa: E402
from celery.schedules import crontab  # noqa: E402
from kombu import Queue, Exchange  # noqa: E402
from core.config import settings  # noqa: E402

celery_app = Celery(
    "projecthub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["celery_worker"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_default_queue="high_priority",
    task_queues=(
        Queue("high_priority", Exchange("high_priority"), routing_key="high_priority"),
        Queue("low_priority", Exchange("low_priority"), routing_key="low_priority"),
    ),
    task_routes={
        # Notifications / real-time events -> high_priority
        "services.notification.check_deadlines": {"queue": "high_priority"},
        # Daily digest / emails -> low_priority
        "services.notification.daily_digest": {"queue": "low_priority"},
        # GitHub sync -> low_priority
        "services.github.sync_all": {"queue": "low_priority"},
        # AI tasks and generic patterns -> low_priority
        "services.ai.*": {"queue": "low_priority"},
        "services.github.*": {"queue": "low_priority"},
        "services.email.*": {"queue": "low_priority"},
        "services.webhooks.*": {"queue": "low_priority"},
        "services.integrations.*": {"queue": "low_priority"},
    },
    beat_schedule={
        "check-deadlines-hourly": {
            "task": "services.notification.check_deadlines",
            "schedule": crontab(minute=0),  # every hour
        },
        "daily-digest-9am": {
            "task": "services.notification.daily_digest",
            "schedule": crontab(hour=9, minute=0),
        },
        "sync-github-15min": {
            "task": "services.github.sync_all",
            "schedule": crontab(minute="*/15"),  # every 15 minutes
        },
    },
)

from celery.signals import task_prerun  # noqa: E402


@task_prerun.connect
def on_task_prerun(*args, **kwargs):
    import sys
    import os

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
