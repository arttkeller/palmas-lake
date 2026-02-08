"""
Property-Based Test for cached endpoint response format consistency.

**Feature: fix-analytics-data-display, Property 1: Cached endpoint response format consistency**
**Validates: Requirements 2.1, 2.2**

For any cached analytics entry in the database, the GET /api/analytics/cached
endpoint response SHALL contain the keys `data`, `calculated_at`,
`calculation_duration_ms`, `is_stale`, `trigger_source`, and `is_calculating`
— matching the same format returned when cache is empty.
"""

import sys
import os
import asyncio
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# The required keys that BOTH empty-cache and populated-cache responses must have
REQUIRED_KEYS = {"data", "calculated_at", "calculation_duration_ms", "is_stale", "trigger_source", "is_calculating"}


# --- Strategies ---

metrics_strategy = st.fixed_dictionaries({
    "total_leads": st.integers(min_value=0, max_value=10000),
    "conversion_rate": st.floats(min_value=0, max_value=100, allow_nan=False, allow_infinity=False),
    "transfer_rate": st.floats(min_value=0, max_value=100, allow_nan=False, allow_infinity=False),
})

trigger_sources = st.sampled_from(["manual_refresh", "auto_empty_cache", "message_webhook", "lead_update"])

cached_row_strategy = st.fixed_dictionaries({
    "id": st.uuids().map(str),
    "metric_type": st.just("dashboard"),
    "data": metrics_strategy,
    "calculated_at": st.datetimes(
        min_value=datetime(2025, 1, 1),
        max_value=datetime(2026, 12, 31),
        timezones=st.just(timezone.utc),
    ).map(lambda d: d.isoformat()),
    "calculation_duration_ms": st.integers(min_value=1, max_value=60000),
    "trigger_source": trigger_sources,
    "previous_data": st.just(None),
    "updated_at": st.datetimes(
        min_value=datetime(2025, 1, 1),
        max_value=datetime(2026, 12, 31),
        timezones=st.just(timezone.utc),
    ).map(lambda d: d.isoformat()),
    "is_stale": st.booleans(),
})


def _run_async(coro):
    """Helper to run an async function in tests."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestCachedEndpointResponseFormat:
    """
    **Feature: fix-analytics-data-display, Property 1: Cached endpoint response format consistency**
    **Validates: Requirements 2.1, 2.2**
    """

    @settings(max_examples=100, deadline=None)
    @given(cached_row=cached_row_strategy)
    def test_populated_cache_has_required_keys(self, cached_row):
        """
        **Feature: fix-analytics-data-display, Property 1: Cached endpoint response format consistency**
        **Validates: Requirements 2.1, 2.2**

        For any cached row returned by get_cached_metrics, the endpoint
        response must contain exactly the required keys.
        """
        from routers.analytics import get_cached_analytics

        with patch("routers.analytics.cache_service") as mock_cs:
            mock_cs.get_cached_metrics.return_value = cached_row
            response = _run_async(get_cached_analytics(metric_type="dashboard"))

        response_keys = set(response.keys())
        assert REQUIRED_KEYS.issubset(response_keys), (
            f"Missing keys: {REQUIRED_KEYS - response_keys}"
        )
        assert response["data"] == cached_row["data"]
        assert response["is_calculating"] is False
        assert response["calculated_at"] == cached_row["calculated_at"]
        assert response["calculation_duration_ms"] == cached_row["calculation_duration_ms"]
        assert response["trigger_source"] == cached_row["trigger_source"]

    def test_empty_cache_has_required_keys(self):
        """
        Verify the empty-cache path also returns the required keys.
        """
        from routers.analytics import get_cached_analytics

        with patch("routers.analytics.cache_service") as mock_cs:
            mock_cs.get_cached_metrics.return_value = None
            mock_cs.process_analytics_background = AsyncMock(return_value=None)
            response = _run_async(get_cached_analytics(metric_type="dashboard"))

        response_keys = set(response.keys())
        assert REQUIRED_KEYS.issubset(response_keys), (
            f"Missing keys in empty-cache response: {REQUIRED_KEYS - response_keys}"
        )
        assert response["data"] is None
        assert response["is_calculating"] is True
