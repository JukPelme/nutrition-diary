"""In-memory rate limiter (per-process). Suitable for single-replica deployments.
For multi-replica setup, swap with Redis-backed implementation later.
"""
import asyncio
import time
from collections import defaultdict, deque

_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = asyncio.Lock()


async def check_rate_limit(key: str, max_calls: int, window_seconds: int) -> bool:
    """Returns True if call allowed, False if limit hit.
    Sliding window: counts calls in the last `window_seconds` for `key`.
    """
    now = time.time()
    cutoff = now - window_seconds
    async with _lock:
        bucket = _buckets[key]
        # Drop expired
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= max_calls:
            return False
        bucket.append(now)
        # Opportunistic cleanup: cap total buckets
        if len(_buckets) > 10000:
            for k in list(_buckets.keys())[:1000]:
                if not _buckets[k] or _buckets[k][-1] < cutoff:
                    _buckets.pop(k, None)
        return True
