from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status


class SlidingWindowLimiter:
    """A small in-process limiter, enough to slow down link guessing.

    State is per worker process, which is fine for a single-instance
    deployment; it is not a substitute for an edge rate limit.
    """

    def __init__(self, max_calls: int, window_seconds: float) -> None:
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._calls: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            calls = self._calls[key]
            while calls and calls[0] <= cutoff:
                calls.popleft()
            if len(calls) >= self.max_calls:
                return False
            calls.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._calls.clear()


def rate_limit_by_ip(limiter: SlidingWindowLimiter):
    def dependency(request: Request) -> None:
        host = request.client.host if request.client else "unknown"
        if not limiter.allow(host):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a minute and retry.",
            )

    return dependency
