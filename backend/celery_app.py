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
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
