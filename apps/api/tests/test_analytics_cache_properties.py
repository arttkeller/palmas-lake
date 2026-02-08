"""
Property-Based Tests for AnalyticsCacheService.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: realtime-analytics-cache**
"""

import sys
import os
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings, strategies as st

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.analytics_cache_service import AnalyticsCacheService


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for valid metric types
metric_type_strategy = st.sampled_from(['dashboard', 'funnel', 'sentiment', 'response_times'])

# Strategy for trigger sources
trigger_source_strategy = st.sampled_from(['message_webhook', 'manual_refresh', 'scheduled'])

# Strategy for calculation duration (realistic range: 10ms to 30000ms)
duration_ms_strategy = st.integers(min_value=10, max_value=30000)

# Strategy for dashboard metrics data (simplified but valid structure)
dashboard_metrics_strategy = st.fixed_dictionaries({
    'total_leads': st.integers(min_value=0, max_value=10000),
    'conversion_rate': st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
    'em_atendimento': st.integers(min_value=0, max_value=10000),
    'transfer_rate': st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
    'transfer_count': st.integers(min_value=0, max_value=1000)
})

# Strategy for timestamps within reasonable range (last year to now)
timestamp_strategy = st.datetimes(
    min_value=datetime(2024, 1, 1),
    max_value=datetime(2026, 12, 31),
    timezones=st.just(timezone.utc)
)


# =============================================================================
# Property Test: Snapshot includes required metadata
# **Feature: realtime-analytics-cache, Property 7: Snapshot includes required metadata**
# **Validates: Requirements 3.1**
# =============================================================================

class TestSnapshotMetadata:
    """
    **Feature: realtime-analytics-cache, Property 7: Snapshot includes required metadata**
    **Validates: Requirements 3.1**
    
    For any stored Metric_Snapshot, the cache entry SHALL include 
    calculated_at timestamp and calculation_duration_ms fields with valid values.
    """
    
    @settings(max_examples=100)
    @given(
        metrics=dashboard_metrics_strategy,
        trigger_source=trigger_source_strategy,
        duration_ms=duration_ms_strategy,
        metric_type=metric_type_strategy
    )
    def test_update_cache_includes_required_metadata(
        self, metrics, trigger_source, duration_ms, metric_type
    ):
        """
        **Feature: realtime-analytics-cache, Property 7: Snapshot includes required metadata**
        **Validates: Requirements 3.1**
        
        Property: For any valid metrics update, the resulting cache entry
        must include calculated_at timestamp and calculation_duration_ms.
        """
        service = AnalyticsCacheService()
        
        # Mock the supabase client
        mock_response = MagicMock()
        mock_response.data = [{
            'id': 'test-uuid',
            'metric_type': metric_type,
            'data': metrics,
            'calculated_at': datetime.now(timezone.utc).isoformat(),
            'calculation_duration_ms': duration_ms,
            'trigger_source': trigger_source,
            'previous_data': None,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }]
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock get_cached_metrics to return None (no existing entry)
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            
            # Mock insert
            mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_response
            
            result = service.update_cache(metrics, trigger_source, duration_ms, metric_type)
        
        # Verify the result contains required metadata
        assert result is not None, "Cache update should return a result"
        assert 'calculated_at' in result, "Result must include calculated_at timestamp"
        assert 'calculation_duration_ms' in result, "Result must include calculation_duration_ms"
        
        # Verify calculated_at is a valid ISO timestamp
        calculated_at = result['calculated_at']
        assert calculated_at is not None, "calculated_at must not be None"
        
        # Verify calculation_duration_ms is a positive integer
        calc_duration = result['calculation_duration_ms']
        assert isinstance(calc_duration, int), "calculation_duration_ms must be an integer"
        assert calc_duration >= 0, "calculation_duration_ms must be non-negative"


# =============================================================================
# Property Test: Previous snapshot preserved
# **Feature: realtime-analytics-cache, Property 8: Previous snapshot preserved**
# **Validates: Requirements 3.3**
# =============================================================================

class TestPreviousSnapshotPreservation:
    """
    **Feature: realtime-analytics-cache, Property 8: Previous snapshot preserved**
    **Validates: Requirements 3.3**
    
    For any cache update, the previous_data field SHALL contain 
    the complete previous Metric_Snapshot before overwriting.
    """
    
    @settings(max_examples=100)
    @given(
        previous_metrics=dashboard_metrics_strategy,
        new_metrics=dashboard_metrics_strategy,
        trigger_source=trigger_source_strategy,
        duration_ms=duration_ms_strategy
    )
    def test_update_preserves_previous_snapshot(
        self, previous_metrics, new_metrics, trigger_source, duration_ms
    ):
        """
        **Feature: realtime-analytics-cache, Property 8: Previous snapshot preserved**
        **Validates: Requirements 3.3**
        
        Property: When updating cache with new metrics, the previous metrics
        data must be preserved in the previous_data field.
        """
        service = AnalyticsCacheService()
        
        # Simulate existing cache entry
        existing_entry = {
            'id': 'existing-uuid',
            'metric_type': 'dashboard',
            'data': previous_metrics,
            'calculated_at': datetime.now(timezone.utc).isoformat(),
            'calculation_duration_ms': 100,
            'trigger_source': 'scheduled',
            'previous_data': None
        }
        
        # Track what gets sent to update
        captured_update_data = None
        
        def capture_update(data):
            nonlocal captured_update_data
            captured_update_data = data
            mock_result = MagicMock()
            mock_result.execute.return_value = MagicMock(data=[{
                **data,
                'id': 'existing-uuid'
            }])
            return mock_result
        
        with patch.object(service, 'supabase') as mock_supabase:
            # Mock get_cached_metrics to return existing entry
            mock_select = MagicMock()
            mock_select.data = [existing_entry]
            mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = mock_select
            
            # Mock update to capture the data
            mock_supabase.table.return_value.update.side_effect = capture_update
            
            service.update_cache(new_metrics, trigger_source, duration_ms, 'dashboard')
        
        # Verify previous_data was set correctly
        assert captured_update_data is not None, "Update should have been called"
        assert 'previous_data' in captured_update_data, "Update must include previous_data field"
        assert captured_update_data['previous_data'] == previous_metrics, \
            "previous_data must contain the complete previous metrics snapshot"


# =============================================================================
# Property Test: Stale data indicator accuracy
# **Feature: realtime-analytics-cache, Property 10: Stale data indicator accuracy**
# **Validates: Requirements 4.2**
# =============================================================================

class TestStaleDataIndicator:
    """
    **Feature: realtime-analytics-cache, Property 10: Stale data indicator accuracy**
    **Validates: Requirements 4.2**
    
    For any cache entry with calculated_at older than 5 minutes, 
    the is_stale computed property SHALL return true.
    """
    
    @settings(max_examples=100)
    @given(
        minutes_ago=st.integers(min_value=6, max_value=1440)  # 6 minutes to 24 hours
    )
    def test_stale_when_older_than_threshold(self, minutes_ago):
        """
        **Feature: realtime-analytics-cache, Property 10: Stale data indicator accuracy**
        **Validates: Requirements 4.2**
        
        Property: Any cache entry older than 5 minutes must be marked as stale.
        """
        service = AnalyticsCacheService()
        
        # Create a cache entry that is older than 5 minutes
        old_timestamp = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        cache_entry = {
            'calculated_at': old_timestamp.isoformat()
        }
        
        is_stale = service.is_cache_stale(cache_entry)
        
        assert is_stale is True, \
            f"Cache entry {minutes_ago} minutes old should be marked as stale"
    
    @settings(max_examples=100)
    @given(
        minutes_ago=st.integers(min_value=0, max_value=4)  # 0 to 4 minutes (within threshold)
    )
    def test_not_stale_when_within_threshold(self, minutes_ago):
        """
        **Feature: realtime-analytics-cache, Property 10: Stale data indicator accuracy**
        **Validates: Requirements 4.2**
        
        Property: Any cache entry within 5 minutes must NOT be marked as stale.
        """
        service = AnalyticsCacheService()
        
        # Create a cache entry that is within 5 minutes
        recent_timestamp = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        cache_entry = {
            'calculated_at': recent_timestamp.isoformat()
        }
        
        is_stale = service.is_cache_stale(cache_entry)
        
        assert is_stale is False, \
            f"Cache entry {minutes_ago} minutes old should NOT be marked as stale"
    
    @settings(max_examples=100)
    @given(
        custom_threshold=st.integers(min_value=2, max_value=60),
        # Use a margin to avoid boundary timing issues
        # minutes_ago is either clearly below or clearly above threshold
        data=st.data()
    )
    def test_stale_respects_custom_threshold(self, custom_threshold, data):
        """
        **Feature: realtime-analytics-cache, Property 10: Stale data indicator accuracy**
        **Validates: Requirements 4.2**
        
        Property: Stale detection must respect custom threshold parameter.
        """
        service = AnalyticsCacheService()
        
        # Generate minutes_ago that is clearly below or above threshold (avoid boundary)
        # Either 0 to threshold-1 (not stale) or threshold+1 to 120 (stale)
        is_below_threshold = data.draw(st.booleans())
        
        if is_below_threshold:
            minutes_ago = data.draw(st.integers(min_value=0, max_value=custom_threshold - 1))
            expected_stale = False
        else:
            minutes_ago = data.draw(st.integers(min_value=custom_threshold + 1, max_value=120))
            expected_stale = True
        
        timestamp = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
        cache_entry = {
            'calculated_at': timestamp.isoformat()
        }
        
        is_stale = service.is_cache_stale(cache_entry, max_age_minutes=custom_threshold)
        
        assert is_stale == expected_stale, \
            f"Cache {minutes_ago}min old with {custom_threshold}min threshold: " \
            f"expected stale={expected_stale}, got {is_stale}"


# =============================================================================
# Property Test: Debounce batches multiple changes
# **Feature: realtime-analytics-cache, Property 5: Debounce batches multiple changes**
# **Validates: Requirements 2.2**
# =============================================================================

class TestDebounceBatching:
    """
    **Feature: realtime-analytics-cache, Property 5: Debounce batches multiple changes**
    **Validates: Requirements 2.2**
    
    For any sequence of N data changes occurring within the 2-second debounce window,
    exactly 1 analytics calculation SHALL be triggered.
    """
    
    # Note: Using deadline=None for async tests due to real-time waiting
    @settings(max_examples=100, deadline=None)
    @given(
        num_changes=st.integers(min_value=2, max_value=10),
        trigger_sources=st.lists(
            trigger_source_strategy,
            min_size=2,
            max_size=10
        )
    )
    def test_multiple_changes_batched_into_single_calculation(
        self, num_changes, trigger_sources
    ):
        """
        **Feature: realtime-analytics-cache, Property 5: Debounce batches multiple changes**
        **Validates: Requirements 2.2**
        
        Property: Multiple rapid changes within debounce window result in exactly
        one recalculation.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        # Use shorter debounce for testing
        service.DEBOUNCE_SECONDS = 0.1
        service.reset_recalculation_count()
        
        # Track callback invocations
        callback_count = 0
        
        async def mock_callback(trigger_source: str):
            nonlocal callback_count
            callback_count += 1
        
        service.set_recalculation_callback(mock_callback)
        
        async def run_test():
            nonlocal callback_count
            # Queue multiple recalculations rapidly (within debounce window)
            sources_to_use = trigger_sources[:num_changes]
            for source in sources_to_use:
                await service.queue_recalculation(source)
                # Small delay but still within debounce window
                await asyncio.sleep(0.005)
            
            # Wait for debounce window to complete plus small buffer
            await asyncio.sleep(service.DEBOUNCE_SECONDS + 0.1)
            
            return callback_count
        
        # Run the async test
        result_count = asyncio.run(run_test())
        
        # Verify exactly 1 recalculation was triggered
        assert result_count == 1, \
            f"Expected exactly 1 recalculation for {num_changes} changes, got {result_count}"
        assert service.recalculation_count == 1, \
            f"Expected recalculation_count=1, got {service.recalculation_count}"
    
    @settings(max_examples=100, deadline=None)
    @given(
        num_changes=st.integers(min_value=1, max_value=10)
    )
    def test_pending_state_tracked_during_debounce(self, num_changes):
        """
        **Feature: realtime-analytics-cache, Property 5: Debounce batches multiple changes**
        **Validates: Requirements 2.2**
        
        Property: During debounce window, pending state is correctly tracked.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        # Use shorter debounce for testing
        service.DEBOUNCE_SECONDS = 0.1
        
        async def mock_callback(trigger_source: str):
            pass
        
        service.set_recalculation_callback(mock_callback)
        
        async def run_test():
            # Initially no pending recalculation
            assert not service.is_recalculation_pending, \
                "Should not have pending recalculation initially"
            
            # Queue recalculations
            for i in range(num_changes):
                await service.queue_recalculation(f'test_source_{i}')
            
            # Should have pending recalculation
            assert service.is_recalculation_pending, \
                "Should have pending recalculation after queueing"
            
            # Should track all trigger sources
            assert service.pending_trigger_count == num_changes, \
                f"Expected {num_changes} pending triggers, got {service.pending_trigger_count}"
            
            # Wait for debounce to complete
            await asyncio.sleep(service.DEBOUNCE_SECONDS + 0.1)
            
            # Should no longer be pending
            assert not service.is_recalculation_pending, \
                "Should not have pending recalculation after debounce completes"
        
        asyncio.run(run_test())


# =============================================================================
# Property Test: Manual refresh triggers immediate calculation
# **Feature: realtime-analytics-cache, Property 11: Manual refresh triggers immediate calculation**
# **Validates: Requirements 4.3**
# =============================================================================

class TestManualRefresh:
    """
    **Feature: realtime-analytics-cache, Property 11: Manual refresh triggers immediate calculation**
    **Validates: Requirements 4.3**
    
    For any manual refresh request, the system SHALL bypass debounce and 
    trigger immediate analytics calculation.
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        trigger_source=trigger_source_strategy
    )
    def test_force_recalculation_bypasses_debounce(self, trigger_source):
        """
        **Feature: realtime-analytics-cache, Property 11: Manual refresh triggers immediate calculation**
        **Validates: Requirements 4.3**
        
        Property: force_recalculation executes immediately without waiting
        for debounce window.
        """
        import asyncio
        import time
        
        service = AnalyticsCacheService()
        # Use longer debounce to make the test meaningful
        service.DEBOUNCE_SECONDS = 1.0
        service.reset_recalculation_count()
        
        callback_times = []
        
        async def mock_callback(source: str):
            callback_times.append(time.time())
        
        service.set_recalculation_callback(mock_callback)
        
        async def run_test():
            start_time = time.time()
            
            # Force recalculation
            await service.force_recalculation(trigger_source)
            
            end_time = time.time()
            elapsed = end_time - start_time
            
            # Should complete much faster than debounce window
            assert elapsed < service.DEBOUNCE_SECONDS, \
                f"force_recalculation took {elapsed}s, should be < {service.DEBOUNCE_SECONDS}s"
            
            # Callback should have been called
            assert len(callback_times) == 1, \
                f"Expected 1 callback, got {len(callback_times)}"
            
            # Callback should have been called almost immediately
            callback_elapsed = callback_times[0] - start_time
            assert callback_elapsed < 0.5, \
                f"Callback took {callback_elapsed}s, should be nearly immediate"
        
        asyncio.run(run_test())
    
    @settings(max_examples=100, deadline=None)
    @given(
        num_pending=st.integers(min_value=1, max_value=5)
    )
    def test_force_recalculation_cancels_pending_debounce(self, num_pending):
        """
        **Feature: realtime-analytics-cache, Property 11: Manual refresh triggers immediate calculation**
        **Validates: Requirements 4.3**
        
        Property: force_recalculation cancels any pending debounced recalculation.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        # Use shorter debounce for testing
        service.DEBOUNCE_SECONDS = 0.2
        service.reset_recalculation_count()
        
        callback_sources = []
        
        async def mock_callback(source: str):
            callback_sources.append(source)
        
        service.set_recalculation_callback(mock_callback)
        
        async def run_test():
            # Queue some recalculations (will be pending in debounce)
            for i in range(num_pending):
                await service.queue_recalculation(f'pending_source_{i}')
            
            # Verify pending state
            assert service.is_recalculation_pending, \
                "Should have pending recalculation"
            
            # Force recalculation should cancel pending and execute immediately
            await service.force_recalculation('manual_refresh')
            
            # Should no longer be pending
            assert not service.is_recalculation_pending, \
                "Should not have pending recalculation after force"
            
            # Only the force recalculation should have executed
            assert len(callback_sources) == 1, \
                f"Expected 1 callback, got {len(callback_sources)}"
            assert callback_sources[0] == 'manual_refresh', \
                f"Expected 'manual_refresh' source, got {callback_sources[0]}"
            
            # Wait to ensure debounced one doesn't fire
            await asyncio.sleep(service.DEBOUNCE_SECONDS + 0.2)
            
            # Still only 1 callback
            assert len(callback_sources) == 1, \
                f"Debounced callback should have been cancelled, got {len(callback_sources)} callbacks"
        
        asyncio.run(run_test())


# =============================================================================
# Property Test: Cache update after data change
# **Feature: realtime-analytics-cache, Property 1: Cache update after data change**
# **Validates: Requirements 1.2, 2.4**
# =============================================================================

class TestCacheUpdateAfterDataChange:
    """
    **Feature: realtime-analytics-cache, Property 1: Cache update after data change**
    **Validates: Requirements 1.2, 2.4**
    
    For any lead or message data change in the database, the analytics_cache 
    table SHALL be updated with new metrics within the debounce window plus 
    processing time.
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        metrics=dashboard_metrics_strategy,
        trigger_source=trigger_source_strategy
    )
    def test_background_worker_updates_cache_after_processing(
        self, metrics, trigger_source
    ):
        """
        **Feature: realtime-analytics-cache, Property 1: Cache update after data change**
        **Validates: Requirements 1.2, 2.4**
        
        Property: When the background worker processes analytics, the cache
        is updated with new metrics including timestamp and duration.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        service._retry_enabled = False  # Disable retries for this test
        
        # Create a mock AnalyticsService
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.return_value = metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        # Track cache updates
        cache_updates = []
        
        # Use exact same parameter names as the actual method
        def mock_update_cache(metrics, trigger_source, duration_ms, metric_type=None):
            """Mock that matches the actual update_cache signature exactly"""
            cache_updates.append({
                'metrics': metrics,
                'trigger_source': trigger_source,
                'duration_ms': duration_ms,
                'metric_type': metric_type
            })
            return {
                'id': 'test-uuid',
                'data': metrics,
                'trigger_source': trigger_source,
                'calculation_duration_ms': duration_ms,
                'calculated_at': datetime.now(timezone.utc).isoformat()
            }
        
        with patch.object(service, 'update_cache', side_effect=mock_update_cache):
            async def run_test():
                result = await service.process_analytics_background(trigger_source)
                return result
            
            result = asyncio.run(run_test())
        
        # Verify cache was updated
        assert len(cache_updates) == 1, \
            f"Expected 1 cache update, got {len(cache_updates)}"
        
        # Verify the update contains correct data
        update = cache_updates[0]
        
        assert update['metrics'] == metrics, \
            "Cache update should contain the calculated metrics"
        assert update['trigger_source'] == trigger_source, \
            f"Expected trigger_source={trigger_source}, got {update['trigger_source']}"
        assert update['duration_ms'] is not None and update['duration_ms'] >= 0, \
            "Duration should be non-negative"
        
        # Verify result is returned
        assert result is not None, \
            "Background worker should return the cache entry"
    
    @settings(max_examples=100, deadline=None)
    @given(
        metrics=dashboard_metrics_strategy,
        trigger_source=trigger_source_strategy
    )
    def test_background_worker_measures_calculation_duration(
        self, metrics, trigger_source
    ):
        """
        **Feature: realtime-analytics-cache, Property 1: Cache update after data change**
        **Validates: Requirements 1.2, 2.4**
        
        Property: The background worker accurately measures and records
        the calculation duration in milliseconds.
        """
        import asyncio
        import time
        
        service = AnalyticsCacheService()
        service._retry_enabled = False
        
        # Simulate a calculation that takes some time
        simulated_delay_ms = 50
        
        def slow_get_metrics():
            time.sleep(simulated_delay_ms / 1000)
            return metrics
        
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.side_effect = slow_get_metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        recorded_duration = None
        
        # Use exact same parameter names as the actual method
        def capture_duration(metrics, trigger_source, duration_ms, metric_type=None):
            nonlocal recorded_duration
            recorded_duration = duration_ms
            return {
                'id': 'test-uuid',
                'data': metrics,
                'calculation_duration_ms': recorded_duration,
                'calculated_at': datetime.now(timezone.utc).isoformat()
            }
        
        with patch.object(service, 'update_cache', side_effect=capture_duration):
            asyncio.run(service.process_analytics_background(trigger_source))
        
        # Verify duration was recorded and is reasonable
        assert recorded_duration is not None, \
            "Duration should be recorded"
        assert recorded_duration >= simulated_delay_ms * 0.8, \
            f"Duration {recorded_duration}ms should be >= {simulated_delay_ms * 0.8}ms"
        # Allow some overhead but not too much
        assert recorded_duration < simulated_delay_ms * 3, \
            f"Duration {recorded_duration}ms seems too high for {simulated_delay_ms}ms delay"
    
    @settings(max_examples=100, deadline=None)
    @given(
        metrics=dashboard_metrics_strategy,
        trigger_source=trigger_source_strategy
    )
    def test_background_worker_logs_start_time_and_trigger(
        self, metrics, trigger_source
    ):
        """
        **Feature: realtime-analytics-cache, Property 1: Cache update after data change**
        **Validates: Requirements 1.2, 2.4**
        
        Property: The background worker logs the start time and trigger source
        for each calculation (tracked via retry_attempts).
        """
        import asyncio
        
        service = AnalyticsCacheService()
        service._retry_enabled = False
        service.reset_retry_attempts()
        
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.return_value = metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        with patch.object(service, 'update_cache', return_value={'id': 'test'}):
            asyncio.run(service.process_analytics_background(trigger_source))
        
        # Verify retry attempts tracking (which includes logging info)
        assert len(service.retry_attempts) == 1, \
            f"Expected 1 attempt logged, got {len(service.retry_attempts)}"
        
        attempt = service.retry_attempts[0]
        assert attempt['trigger_source'] == trigger_source, \
            f"Expected trigger_source={trigger_source}, got {attempt['trigger_source']}"
        assert 'start_time' in attempt, \
            "Attempt should include start_time"
        assert attempt['status'] == 'success', \
            f"Expected status=success, got {attempt['status']}"


# =============================================================================
# Property Test: Retry on failure with backoff
# **Feature: realtime-analytics-cache, Property 6: Retry on failure with backoff**
# **Validates: Requirements 2.5**
# =============================================================================

class TestRetryWithBackoff:
    """
    **Feature: realtime-analytics-cache, Property 6: Retry on failure with backoff**
    **Validates: Requirements 2.5**
    
    For any failed analytics calculation, the system SHALL retry up to 3 times 
    with exponential backoff (2s, 4s, 8s delays).
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        trigger_source=trigger_source_strategy,
        num_failures=st.integers(min_value=1, max_value=2)  # 1-2 failures before success
    )
    def test_retry_on_failure_then_success(self, trigger_source, num_failures):
        """
        **Feature: realtime-analytics-cache, Property 6: Retry on failure with backoff**
        **Validates: Requirements 2.5**
        
        Property: When analytics calculation fails, the system retries and
        eventually succeeds if a subsequent attempt works.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        # Use very short delays for testing
        service.RETRY_BASE_DELAY_SECONDS = 0.01
        service.reset_retry_attempts()
        
        # Track call count
        call_count = 0
        
        def failing_then_success_metrics():
            nonlocal call_count
            call_count += 1
            if call_count <= num_failures:
                raise Exception(f"Simulated failure {call_count}")
            return {'total_leads': 100, 'conversion_rate': 50.0}
        
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.side_effect = failing_then_success_metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        def mock_update_cache(metrics, trigger_source, duration_ms, metric_type=None):
            return {
                'id': 'test-uuid',
                'data': metrics,
                'calculated_at': datetime.now(timezone.utc).isoformat()
            }
        
        with patch.object(service, 'update_cache', side_effect=mock_update_cache):
            result = asyncio.run(service.process_analytics_background(trigger_source))
        
        # Verify the result is successful after retries
        assert result is not None, \
            f"Should succeed after {num_failures} failures"
        
        # Verify correct number of attempts
        expected_attempts = num_failures + 1
        assert len(service.retry_attempts) == expected_attempts, \
            f"Expected {expected_attempts} attempts, got {len(service.retry_attempts)}"
        
        # Verify failed attempts are tracked
        for i in range(num_failures):
            assert service.retry_attempts[i]['status'] == 'failed', \
                f"Attempt {i+1} should be marked as failed"
        
        # Verify final attempt succeeded
        assert service.retry_attempts[-1]['status'] == 'success', \
            "Final attempt should be marked as success"
    
    @settings(max_examples=100, deadline=None)
    @given(
        trigger_source=trigger_source_strategy
    )
    def test_retry_exhausted_after_max_attempts(self, trigger_source):
        """
        **Feature: realtime-analytics-cache, Property 6: Retry on failure with backoff**
        **Validates: Requirements 2.5**
        
        Property: When all retry attempts fail, the system returns None
        and logs all 3 failed attempts.
        """
        import asyncio
        
        service = AnalyticsCacheService()
        # Use very short delays for testing
        service.RETRY_BASE_DELAY_SECONDS = 0.01
        service.reset_retry_attempts()
        
        def always_failing_metrics():
            raise Exception("Persistent failure")
        
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.side_effect = always_failing_metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        result = asyncio.run(service.process_analytics_background(trigger_source))
        
        # Verify result is None after all retries exhausted
        assert result is None, \
            "Should return None after all retries exhausted"
        
        # Verify exactly MAX_RETRIES attempts were made
        assert len(service.retry_attempts) == service.MAX_RETRIES, \
            f"Expected {service.MAX_RETRIES} attempts, got {len(service.retry_attempts)}"
        
        # Verify all attempts are marked as failed
        for i, attempt in enumerate(service.retry_attempts):
            assert attempt['status'] == 'failed', \
                f"Attempt {i+1} should be marked as failed"
            assert 'error' in attempt, \
                f"Attempt {i+1} should include error message"
    
    @settings(max_examples=100, deadline=None)
    @given(
        trigger_source=trigger_source_strategy
    )
    def test_exponential_backoff_delays(self, trigger_source):
        """
        **Feature: realtime-analytics-cache, Property 6: Retry on failure with backoff**
        **Validates: Requirements 2.5**
        
        Property: Retry delays follow exponential backoff pattern (2s, 4s, 8s).
        """
        import asyncio
        import time
        
        service = AnalyticsCacheService()
        # Use short but measurable delays for testing
        service.RETRY_BASE_DELAY_SECONDS = 0.05  # 50ms base
        service.reset_retry_attempts()
        
        # Track timing between attempts
        attempt_times = []
        
        def failing_metrics():
            attempt_times.append(time.time())
            raise Exception("Simulated failure")
        
        mock_analytics_service = MagicMock()
        mock_analytics_service.get_dashboard_metrics.side_effect = failing_metrics
        
        service.set_analytics_service(mock_analytics_service)
        
        asyncio.run(service.process_analytics_background(trigger_source))
        
        # Verify we have 3 attempts
        assert len(attempt_times) == 3, \
            f"Expected 3 attempts, got {len(attempt_times)}"
        
        # Calculate delays between attempts
        delay_1_to_2 = attempt_times[1] - attempt_times[0]
        delay_2_to_3 = attempt_times[2] - attempt_times[1]
        
        # Expected delays: 0.05s (2^0 * 0.05), 0.1s (2^1 * 0.05)
        expected_delay_1 = service.RETRY_BASE_DELAY_SECONDS * (2 ** 0)  # 0.05s
        expected_delay_2 = service.RETRY_BASE_DELAY_SECONDS * (2 ** 1)  # 0.1s
        
        # Allow 50% tolerance for timing variations
        assert delay_1_to_2 >= expected_delay_1 * 0.5, \
            f"First delay {delay_1_to_2}s should be >= {expected_delay_1 * 0.5}s"
        assert delay_2_to_3 >= expected_delay_2 * 0.5, \
            f"Second delay {delay_2_to_3}s should be >= {expected_delay_2 * 0.5}s"
        
        # Verify exponential growth: second delay should be roughly 2x first
        assert delay_2_to_3 > delay_1_to_2 * 1.5, \
            f"Second delay ({delay_2_to_3}s) should be > 1.5x first delay ({delay_1_to_2}s)"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


# =============================================================================
# Property Test: Message triggers recalculation queue
# **Feature: realtime-analytics-cache, Property 4: Message triggers recalculation queue**
# **Validates: Requirements 2.1**
# =============================================================================

class TestMessageTriggersRecalculation:
    """
    **Feature: realtime-analytics-cache, Property 4: Message triggers recalculation queue**
    **Validates: Requirements 2.1**
    
    For any message inserted into the messages table via webhook, 
    a recalculation job SHALL be queued in the debouncer.
    """
    
    @settings(max_examples=100, deadline=None)
    @given(
        message_text=st.text(min_size=1, max_size=500).filter(lambda x: x.strip() and x.strip().lower() != '#apagar'),
        remote_jid=st.from_regex(r'[0-9]{10,15}@s\.whatsapp\.net', fullmatch=True)
    )
    def test_message_webhook_queues_recalculation(self, message_text, remote_jid):
        """
        **Feature: realtime-analytics-cache, Property 4: Message triggers recalculation queue**
        **Validates: Requirements 2.1**
        
        Property: When a message is received via webhook and saved to the database,
        a recalculation job is queued with 'message_webhook' as the trigger source.
        """
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        
        # Import the webhook module to access the analytics_cache_service
        from routers import webhook
        
        # Track queue_recalculation calls
        queue_calls = []
        
        async def mock_queue_recalculation(trigger_source: str):
            queue_calls.append(trigger_source)
        
        # Create a mock request with Evolution API v2 format
        mock_request = AsyncMock()
        mock_request.json.return_value = {
            "event": "messages.upsert",
            "data": {
                "key": {
                    "remoteJid": remote_jid,
                    "fromMe": False,
                    "id": "test-msg-id"
                },
                "message": {
                    "conversation": message_text
                }
            }
        }
        
        async def run_test():
            # Patch the analytics_cache_service's queue_recalculation method
            with patch.object(
                webhook.analytics_cache_service, 
                'queue_recalculation', 
                side_effect=mock_queue_recalculation
            ):
                # Patch the message service at the import location
                with patch('services.message_service.MessageService') as mock_msg_service_class:
                    mock_msg_service = MagicMock()
                    mock_msg_service_class.return_value = mock_msg_service
                    
                    # Patch add_to_buffer to avoid actual buffer operations
                    with patch('routers.webhook.add_to_buffer', new_callable=AsyncMock):
                        # Call the webhook handler
                        result = await webhook.handle_uazapi_webhook(mock_request)
            
            return result
        
        result = asyncio.run(run_test())
        
        # Verify the webhook returned successfully
        assert result == {"status": "received"}, \
            f"Webhook should return received status, got {result}"
        
        # Verify queue_recalculation was called with 'message_webhook'
        assert len(queue_calls) == 1, \
            f"Expected 1 queue_recalculation call, got {len(queue_calls)}"
        assert queue_calls[0] == 'message_webhook', \
            f"Expected trigger_source='message_webhook', got '{queue_calls[0]}'"
    
    @settings(max_examples=100, deadline=None)
    @given(
        message_text=st.text(min_size=1, max_size=500).filter(lambda x: x.strip() and x.strip().lower() != '#apagar'),
        chat_id=st.from_regex(r'[0-9]{10,15}', fullmatch=True)
    )
    def test_blackai_format_message_queues_recalculation(self, message_text, chat_id):
        """
        **Feature: realtime-analytics-cache, Property 4: Message triggers recalculation queue**
        **Validates: Requirements 2.1**
        
        Property: When a message is received via BlackAI/Direct UazAPI format,
        a recalculation job is queued with 'message_webhook' as the trigger source.
        """
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        
        from routers import webhook
        
        queue_calls = []
        
        async def mock_queue_recalculation(trigger_source: str):
            queue_calls.append(trigger_source)
        
        # Create a mock request with BlackAI format
        mock_request = AsyncMock()
        mock_request.json.return_value = {
            "EventType": "messages",
            "message": {
                "chatid": chat_id,
                "fromMe": False,
                "text": message_text,
                "id": "test-msg-id"
            }
        }
        
        async def run_test():
            with patch.object(
                webhook.analytics_cache_service, 
                'queue_recalculation', 
                side_effect=mock_queue_recalculation
            ):
                with patch('services.message_service.MessageService') as mock_msg_service_class:
                    mock_msg_service = MagicMock()
                    mock_msg_service_class.return_value = mock_msg_service
                    
                    with patch('routers.webhook.add_to_buffer', new_callable=AsyncMock):
                        result = await webhook.handle_uazapi_webhook(mock_request)
            
            return result
        
        result = asyncio.run(run_test())
        
        assert result == {"status": "received"}, \
            f"Webhook should return received status, got {result}"
        
        assert len(queue_calls) == 1, \
            f"Expected 1 queue_recalculation call, got {len(queue_calls)}"
        assert queue_calls[0] == 'message_webhook', \
            f"Expected trigger_source='message_webhook', got '{queue_calls[0]}'"
    
    @settings(max_examples=100, deadline=None)
    @given(
        message_text=st.text(min_size=1, max_size=500).filter(lambda x: x.strip() and x.strip().lower() != '#apagar'),
        remote_jid=st.from_regex(r'[0-9]{10,15}@s\.whatsapp\.net', fullmatch=True)
    )
    def test_webhook_response_not_blocked_by_recalculation(self, message_text, remote_jid):
        """
        **Feature: realtime-analytics-cache, Property 4: Message triggers recalculation queue**
        **Validates: Requirements 2.1**
        
        Property: The webhook response is returned immediately without waiting
        for the analytics recalculation to complete.
        """
        import asyncio
        import time
        from unittest.mock import AsyncMock, patch, MagicMock
        
        from routers import webhook
        
        # Simulate a slow recalculation
        slow_delay = 0.5  # 500ms delay
        
        async def slow_queue_recalculation(trigger_source: str):
            await asyncio.sleep(slow_delay)
        
        mock_request = AsyncMock()
        mock_request.json.return_value = {
            "event": "messages.upsert",
            "data": {
                "key": {
                    "remoteJid": remote_jid,
                    "fromMe": False,
                    "id": "test-msg-id"
                },
                "message": {
                    "conversation": message_text
                }
            }
        }
        
        async def run_test():
            start_time = time.time()
            
            with patch.object(
                webhook.analytics_cache_service, 
                'queue_recalculation', 
                side_effect=slow_queue_recalculation
            ):
                with patch('services.message_service.MessageService') as mock_msg_service_class:
                    mock_msg_service = MagicMock()
                    mock_msg_service_class.return_value = mock_msg_service
                    
                    with patch('routers.webhook.add_to_buffer', new_callable=AsyncMock):
                        result = await webhook.handle_uazapi_webhook(mock_request)
            
            elapsed = time.time() - start_time
            return result, elapsed
        
        result, elapsed = asyncio.run(run_test())
        
        # Verify the webhook returned successfully
        assert result == {"status": "received"}, \
            f"Webhook should return received status, got {result}"
        
        # Verify the response was not blocked by the slow recalculation
        # The webhook should return much faster than the slow_delay
        assert elapsed < slow_delay * 0.5, \
            f"Webhook took {elapsed}s, should be < {slow_delay * 0.5}s (not blocked by recalculation)"
