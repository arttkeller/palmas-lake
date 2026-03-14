"""
observability.py — Structured logging and metrics collection for Palmas Lake API.

Provides two main components:

  StructuredLogger  — Wraps stdlib logging and emits JSON lines to stdout,
                      which Docker/Easypanel captures natively.

  MetricsCollector  — Fire-and-forget Redis counter/sorted-set writer.
                      All write methods are async and meant to be called via
                      asyncio.create_task() so they never block the hot path.
                      If Redis is unavailable the calls silently no-op.

Usage:
    from services.observability import get_logger, metrics, init_metrics

    log = get_logger(__name__)
    log.info("webhook_received", channel="whatsapp", lead_id="abc123")

    # In lifespan startup:
    init_metrics(redis_client)

    # In hot path (non-blocking):
    asyncio.create_task(metrics.record_ai_call(...))
    asyncio.create_task(metrics.record_http_request(...))
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Optional

# ---------------------------------------------------------------------------
# Cost table (USD per 1M tokens)
# ---------------------------------------------------------------------------

COST_PER_1M_TOKENS: dict[str, dict[str, float]] = {
    "gpt-5.4": {"input": 5.00, "output": 15.00, "cached": 1.25},
    "gpt-5-mini": {"input": 0.25, "output": 2.00, "cached": 0.03},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60, "cached": 0.075},
}

# Default pricing used when the model is not in the table
_DEFAULT_COST = {"input": 0.0, "output": 0.0, "cached": 0.0}

# Redis TTL for all metric keys (24 h rolling window)
_TTL = 86_400

# Maximum number of latency samples kept in the sorted set
_LATENCY_MAX_MEMBERS = 10_000


# ---------------------------------------------------------------------------
# StructuredLogger
# ---------------------------------------------------------------------------

class StructuredLogger:
    """
    Thin wrapper around a stdlib Logger that emits one JSON object per call.

    Each log line contains at minimum:
        {"event": "...", "level": "INFO", "ts": 1234567890.123, ...kwargs}

    The underlying stdlib logger is configured to write plain text to stdout
    (Docker/Easypanel captures stdout).  We serialise the JSON ourselves so
    the full structured payload is preserved in a single line.
    """

    def __init__(self, name: str) -> None:
        self._logger = logging.getLogger(name)
        # Ensure at least one handler so the message is not swallowed when
        # the root logger has no handlers configured.
        if not self._logger.handlers and not logging.root.handlers:
            _handler = logging.StreamHandler()
            _handler.setFormatter(logging.Formatter("%(message)s"))
            self._logger.addHandler(_handler)

    def _emit(self, level: str, event: str, **kwargs) -> None:
        payload = {"event": event, "level": level, "ts": time.time(), **kwargs}
        line = json.dumps(payload, default=str, ensure_ascii=False)
        log_fn = getattr(self._logger, level.lower(), self._logger.info)
        log_fn(line)

    def info(self, event: str, **kwargs) -> None:
        """Log an INFO-level structured event."""
        self._emit("INFO", event, **kwargs)

    def warning(self, event: str, **kwargs) -> None:
        """Log a WARNING-level structured event."""
        self._emit("WARNING", event, **kwargs)

    def error(self, event: str, **kwargs) -> None:
        """Log an ERROR-level structured event."""
        self._emit("ERROR", event, **kwargs)


def get_logger(name: str) -> StructuredLogger:
    """Factory — returns a StructuredLogger bound to *name* (typically __name__)."""
    return StructuredLogger(name)


# ---------------------------------------------------------------------------
# MetricsCollector
# ---------------------------------------------------------------------------

class MetricsCollector:
    """
    Fire-and-forget metrics writer backed by Redis counters and sorted sets.

    All public methods are coroutines designed to be scheduled with
    ``asyncio.create_task()`` so they never add latency to the caller.

    If the Redis client is not initialised (``init()`` not called) or if any
    Redis operation raises an exception, the error is silently ignored —
    metrics must NEVER cause availability issues.
    """

    def __init__(self) -> None:
        self._redis: Optional[object] = None  # redis.asyncio.Redis

    def init(self, redis_client) -> None:
        """Inject the shared ``redis.asyncio.Redis`` instance at startup."""
        self._redis = redis_client

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _incr(self, key: str) -> None:
        """INCR key and reset TTL to 24 h."""
        try:
            if self._redis is None:
                return
            await self._redis.incr(key)
            await self._redis.expire(key, _TTL)
        except Exception:
            pass

    async def _incrby(self, key: str, amount: int) -> None:
        """INCRBY key by *amount* and reset TTL to 24 h."""
        if amount == 0:
            return
        try:
            if self._redis is None:
                return
            await self._redis.incrby(key, amount)
            await self._redis.expire(key, _TTL)
        except Exception:
            pass

    async def _zadd(self, key: str, score: float, member: str) -> None:
        """ZADD a single member and reset TTL to 24 h."""
        try:
            if self._redis is None:
                return
            await self._redis.zadd(key, {member: score})
            await self._redis.expire(key, _TTL)
        except Exception:
            pass

    async def _get_int(self, key: str) -> int:
        """GET a Redis string key as int (0 if missing / error)."""
        try:
            if self._redis is None:
                return 0
            val = await self._redis.get(key)
            return int(val) if val is not None else 0
        except Exception:
            return 0

    async def _zrange_all(self, key: str) -> list[str]:
        """Return all members of a sorted set as decoded strings."""
        try:
            if self._redis is None:
                return []
            members = await self._redis.zrangebyscore(key, "-inf", "+inf")
            if not members:
                return []
            # redis.asyncio returns bytes by default
            return [m.decode() if isinstance(m, bytes) else m for m in members]
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Public write methods
    # ------------------------------------------------------------------

    async def record_ai_call(
        self,
        model: str,
        duration_ms: float,
        tokens_in: int,
        tokens_out: int,
        cached_tokens: int,
        success: bool,
        lead_id: str = "",
    ) -> None:
        """
        Record one AI model invocation.

        Writes:
          - global call counters (total / success)
          - per-model call count and token counts
          - a latency sample into the sorted set (trimmed to _LATENCY_MAX_MEMBERS)
        """
        try:
            if self._redis is None:
                return

            await self._incr("metrics:ai:calls:total")
            if success:
                await self._incr("metrics:ai:calls:success")

            safe_model = model.replace(":", "_")
            await self._incr(f"metrics:ai:model:{safe_model}:count")
            await self._incrby(f"metrics:ai:model:{safe_model}:tokens_in", int(tokens_in))
            await self._incrby(f"metrics:ai:model:{safe_model}:tokens_out", int(tokens_out))
            await self._incrby(f"metrics:ai:model:{safe_model}:cached_tokens", int(cached_tokens))

            # Latency sample — store as JSON member, score = timestamp
            sample = json.dumps(
                {"lead_id": lead_id, "duration_ms": round(duration_ms, 2), "model": model},
                ensure_ascii=False,
            )
            ts = time.time()
            key = "metrics:ai:latency:recent"
            await self._zadd(key, ts, sample)

            # Trim old members to avoid unbounded growth
            try:
                count = await self._redis.zcard(key)
                if count > _LATENCY_MAX_MEMBERS:
                    await self._redis.zremrangebyrank(key, 0, count - _LATENCY_MAX_MEMBERS - 1)
            except Exception:
                pass

        except Exception:
            pass

    async def record_http_request(
        self,
        path: str,
        method: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        """
        Record one HTTP request for a given path + method pair.

        Writes per-endpoint call count and cumulative latency sum (integer ms).
        """
        try:
            if self._redis is None:
                return
            safe_path = path.strip("/").replace("/", "_") or "root"
            safe_method = method.upper()
            await self._incr(f"metrics:http:{safe_method}:{safe_path}:count")
            await self._incrby(
                f"metrics:http:{safe_method}:{safe_path}:latency_sum",
                int(duration_ms),
            )
        except Exception:
            pass

    async def record_transfer(self, lead_id: str) -> None:
        """Record a lead transfer (Maria → seller handoff)."""
        await self._incr("metrics:business:transfers")

    async def record_message_sent(self, channel: str, lead_id: str = "") -> None:
        """
        Record an outbound message on *channel* (e.g. ``"whatsapp"``, ``"instagram"``).
        """
        safe_channel = channel.lower().replace(" ", "_")
        await self._incr(f"metrics:business:messages:{safe_channel}")

    async def record_buffer_fired(self, lead_id: str, msg_count: int) -> None:
        """
        Record a buffer flush event.

        Increments the total buffer-fire counter and a per-flush message count
        so average batch size can be derived in get_summary.
        """
        try:
            if self._redis is None:
                return
            await self._incr("metrics:buffer:fires")
            await self._incrby("metrics:buffer:msgs_total", int(msg_count))
        except Exception:
            pass

    async def record_routing_decision(self, decision: str) -> None:
        """
        Record an agent-routing decision.

        *decision* is typically ``"heavy"`` (full Maria pipeline) or
        ``"light"`` (quick-reply / template path).
        """
        safe = decision.lower().replace(" ", "_")
        await self._incr(f"metrics:routing:{safe}:count")

    async def record_cache_event(self, hit: bool) -> None:
        """Record a cache hit or miss."""
        key = "metrics:cache:hits" if hit else "metrics:cache:misses"
        await self._incr(key)

    # ------------------------------------------------------------------
    # Execution log (Supabase)
    # ------------------------------------------------------------------

    async def log_execution(
        self,
        type: str,
        path: str,
        *,
        method: str = "",
        status_code: int = 200,
        duration_ms: float = 0,
        lead_id: str = "",
        channel: str = "",
        model: str = "",
        tokens_in: int = 0,
        tokens_out: int = 0,
        routing_decision: str = "",
        payload: dict | None = None,
        metadata: dict | None = None,
    ) -> None:
        """
        Insert one execution log row into Supabase (fire-and-forget).

        Call via ``asyncio.create_task(metrics.log_execution(...))``.
        Never blocks the hot path; silently no-ops on any error.
        """
        try:
            from services.supabase_client import create_client
            sb = create_client()
            row = {
                "type": type,
                "method": method or None,
                "path": path,
                "status_code": status_code,
                "duration_ms": round(duration_ms, 2),
                "lead_id": lead_id or None,
                "channel": channel or None,
                "model": model or None,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "routing_decision": routing_decision or None,
                "payload": payload,
                "metadata": metadata,
            }
            await asyncio.to_thread(
                lambda: sb.table("execution_logs").insert(row).execute()
            )
        except Exception:
            pass  # never block or crash the main flow

    # ------------------------------------------------------------------
    # Read / aggregation
    # ------------------------------------------------------------------

    async def get_summary(self) -> dict:
        """
        Read all metric keys from Redis and return an aggregated summary dict.

        Computes p50 / p95 from the latency sorted set and estimates cost
        from per-model token counters using COST_PER_1M_TOKENS.

        Returns a dict with keys: ``ai``, ``http``, ``business``, ``routing``,
        ``cache``.  On any Redis error an empty / zeroed structure is returned.
        """
        try:
            if self._redis is None:
                return _empty_summary()

            # ---- AI counters ----------------------------------------
            calls_total = await self._get_int("metrics:ai:calls:total")
            calls_success = await self._get_int("metrics:ai:calls:success")

            # Discover model keys via scan
            by_model: dict[str, dict] = {}
            tokens_in_total = 0
            tokens_out_total = 0
            cached_tokens_total = 0
            cost_usd_est = 0.0

            try:
                cursor = 0
                model_keys: set[str] = set()
                while True:
                    cursor, keys = await self._redis.scan(
                        cursor, match="metrics:ai:model:*:count", count=100
                    )
                    for k in keys:
                        k_str = k.decode() if isinstance(k, bytes) else k
                        # extract model name between "metrics:ai:model:" and ":count"
                        parts = k_str.split(":")
                        # ["metrics","ai","model",<model_parts...>,"count"]
                        model_name = ":".join(parts[3:-1])
                        model_keys.add(model_name)
                    if cursor == 0:
                        break

                for safe_model in model_keys:
                    count = await self._get_int(f"metrics:ai:model:{safe_model}:count")
                    t_in = await self._get_int(f"metrics:ai:model:{safe_model}:tokens_in")
                    t_out = await self._get_int(f"metrics:ai:model:{safe_model}:tokens_out")
                    t_cached = await self._get_int(f"metrics:ai:model:{safe_model}:cached_tokens")

                    tokens_in_total += t_in
                    tokens_out_total += t_out
                    cached_tokens_total += t_cached

                    # Restore original model name (underscores were used as safe chars)
                    original_model = safe_model  # best effort
                    pricing = COST_PER_1M_TOKENS.get(original_model, _DEFAULT_COST)
                    model_cost = (
                        t_in / 1_000_000 * pricing["input"]
                        + t_out / 1_000_000 * pricing["output"]
                        + t_cached / 1_000_000 * pricing["cached"]
                    )
                    cost_usd_est += model_cost

                    by_model[safe_model] = {
                        "count": count,
                        "tokens_in": t_in,
                        "tokens_out": t_out,
                        "cached_tokens": t_cached,
                        "cost_usd_est": round(model_cost, 6),
                    }
            except Exception:
                pass

            # ---- Latency percentiles --------------------------------
            avg_latency_ms = 0.0
            p50_latency_ms = 0.0
            p95_latency_ms = 0.0

            latency_members = await self._zrange_all("metrics:ai:latency:recent")
            durations: list[float] = []
            for raw in latency_members:
                try:
                    obj = json.loads(raw)
                    durations.append(float(obj.get("duration_ms", 0)))
                except Exception:
                    pass

            if durations:
                durations_sorted = sorted(durations)
                n = len(durations_sorted)
                avg_latency_ms = sum(durations_sorted) / n
                p50_latency_ms = _percentile(durations_sorted, 50)
                p95_latency_ms = _percentile(durations_sorted, 95)

            # ---- HTTP counters --------------------------------------
            requests_total = 0
            by_endpoint: dict[str, dict] = {}

            try:
                cursor = 0
                endpoint_keys: set[str] = set()
                while True:
                    cursor, keys = await self._redis.scan(
                        cursor, match="metrics:http:*:count", count=100
                    )
                    for k in keys:
                        k_str = k.decode() if isinstance(k, bytes) else k
                        # strip leading "metrics:http:" and trailing ":count"
                        inner = k_str[len("metrics:http:"):-len(":count")]
                        endpoint_keys.add(inner)
                    if cursor == 0:
                        break

                for ep in endpoint_keys:
                    count = await self._get_int(f"metrics:http:{ep}:count")
                    lat_sum = await self._get_int(f"metrics:http:{ep}:latency_sum")
                    requests_total += count
                    avg_ep_lat = (lat_sum / count) if count > 0 else 0.0
                    by_endpoint[ep] = {
                        "count": count,
                        "latency_sum_ms": lat_sum,
                        "avg_latency_ms": round(avg_ep_lat, 2),
                    }
            except Exception:
                pass

            # ---- Business counters ----------------------------------
            transfers = await self._get_int("metrics:business:transfers")

            messages_sent: dict[str, int] = {}
            try:
                cursor = 0
                while True:
                    cursor, keys = await self._redis.scan(
                        cursor, match="metrics:business:messages:*", count=100
                    )
                    for k in keys:
                        k_str = k.decode() if isinstance(k, bytes) else k
                        channel = k_str.split(":")[-1]
                        messages_sent[channel] = await self._get_int(k_str)
                    if cursor == 0:
                        break
            except Exception:
                pass

            # Ensure whatsapp / instagram always present for dashboards
            messages_sent.setdefault("whatsapp", 0)
            messages_sent.setdefault("instagram", 0)

            # ---- Routing counters -----------------------------------
            routing: dict[str, int] = {}
            try:
                cursor = 0
                while True:
                    cursor, keys = await self._redis.scan(
                        cursor, match="metrics:routing:*:count", count=100
                    )
                    for k in keys:
                        k_str = k.decode() if isinstance(k, bytes) else k
                        parts = k_str.split(":")
                        decision = parts[2] if len(parts) >= 4 else "unknown"
                        routing[decision] = await self._get_int(k_str)
                    if cursor == 0:
                        break
            except Exception:
                pass

            routing.setdefault("heavy", 0)
            routing.setdefault("light", 0)

            # ---- Cache counters -------------------------------------
            cache_hits = await self._get_int("metrics:cache:hits")
            cache_misses = await self._get_int("metrics:cache:misses")
            cache_total = cache_hits + cache_misses
            hit_rate = (cache_hits / cache_total) if cache_total > 0 else 0.0

            return {
                "ai": {
                    "calls_total": calls_total,
                    "calls_success": calls_success,
                    "avg_latency_ms": round(avg_latency_ms, 2),
                    "p50_latency_ms": round(p50_latency_ms, 2),
                    "p95_latency_ms": round(p95_latency_ms, 2),
                    "tokens_in_total": tokens_in_total,
                    "tokens_out_total": tokens_out_total,
                    "cached_tokens_total": cached_tokens_total,
                    "cost_usd_est": round(cost_usd_est, 6),
                    "by_model": by_model,
                },
                "http": {
                    "requests_total": requests_total,
                    "by_endpoint": by_endpoint,
                },
                "business": {
                    "transfers": transfers,
                    "messages_sent": messages_sent,
                },
                "routing": routing,
                "cache": {
                    "hits": cache_hits,
                    "misses": cache_misses,
                    "hit_rate": round(hit_rate, 4),
                },
            }

        except Exception:
            return _empty_summary()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _percentile(sorted_data: list[float], pct: int) -> float:
    """Return the *pct*-th percentile of a pre-sorted list."""
    if not sorted_data:
        return 0.0
    n = len(sorted_data)
    # Nearest-rank method
    idx = max(0, min(n - 1, int(pct / 100 * n)))
    return sorted_data[idx]


def _empty_summary() -> dict:
    """Return a zeroed summary structure for error / uninitialized cases."""
    return {
        "ai": {
            "calls_total": 0,
            "calls_success": 0,
            "avg_latency_ms": 0.0,
            "p50_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "tokens_in_total": 0,
            "tokens_out_total": 0,
            "cached_tokens_total": 0,
            "cost_usd_est": 0.0,
            "by_model": {},
        },
        "http": {"requests_total": 0, "by_endpoint": {}},
        "business": {
            "transfers": 0,
            "messages_sent": {"whatsapp": 0, "instagram": 0},
        },
        "routing": {"heavy": 0, "light": 0},
        "cache": {"hits": 0, "misses": 0, "hit_rate": 0.0},
    }


# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

#: Global MetricsCollector instance — import and use directly.
metrics = MetricsCollector()


def init_metrics(redis_client) -> None:
    """
    Inject the shared ``redis.asyncio.Redis`` instance into the global
    ``metrics`` singleton.  Call this once from the application lifespan
    startup handler.

    Example::

        from services.observability import init_metrics
        init_metrics(redis_client)
    """
    metrics.init(redis_client)
