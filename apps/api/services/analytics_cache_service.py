"""
Analytics Cache Service - Manages cached analytics with debounce support.

This service provides methods to:
- Read cached metrics from the analytics_cache table
- Update cache while preserving previous snapshots
- Check if cached data is stale (older than 5 minutes)
- Queue recalculations with debounce to batch multiple changes
- Force immediate recalculation bypassing debounce
- Background worker for analytics processing with retry logic

Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.3, 4.2, 4.3
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Callable, Awaitable
from services.supabase_client import create_client

# Configure logging
logger = logging.getLogger(__name__)


class AnalyticsCacheService:
    """Manages the analytics cache with debounce support."""
    
    STALE_THRESHOLD_MINUTES = 5
    DEFAULT_METRIC_TYPE = 'dashboard'
    DEBOUNCE_SECONDS = 2
    MAX_RETRIES = 3
    RETRY_BASE_DELAY_SECONDS = 2  # Base delay for exponential backoff
    
    def __init__(self, analytics_service=None):
        self.supabase = create_client()
        # Debounce state
        self._pending_recalc = False
        self._debounce_task: Optional[asyncio.Task] = None
        self._pending_trigger_sources: list[str] = []
        # Callback for actual recalculation (to be set by background worker)
        self._recalculation_callback: Optional[Callable[[str], Awaitable[None]]] = None
        # Track recalculation count for testing
        self._recalculation_count = 0
        # Analytics service for background processing
        self._analytics_service = analytics_service
        # Track retry attempts for testing
        self._retry_attempts: list[Dict[str, Any]] = []
        # Flag to enable/disable retry logic (for testing)
        self._retry_enabled = True
    
    def set_recalculation_callback(
        self, 
        callback: Callable[[str], Awaitable[None]]
    ) -> None:
        """
        Sets the callback function to be called when recalculation is triggered.
        
        Args:
            callback: Async function that performs the actual analytics recalculation.
                     Receives trigger_source as argument.
        """
        self._recalculation_callback = callback
    
    async def queue_recalculation(self, trigger_source: str) -> None:
        """
        Queues analytics recalculation with a 2-second debounce window.
        
        Multiple calls within the debounce window are batched into a single
        recalculation. The trigger sources are combined for logging.
        
        Args:
            trigger_source: What triggered this recalculation 
                          (e.g., 'message_webhook', 'lead_update')
        
        Requirements: 2.1 - Queue analytics recalculation when message received
        Requirements: 2.2 - Batch multiple changes within debounce window
        """
        # Track the trigger source
        self._pending_trigger_sources.append(trigger_source)
        self._pending_recalc = True
        
        # Cancel existing debounce task if any
        if self._debounce_task is not None and not self._debounce_task.done():
            self._debounce_task.cancel()
            try:
                await self._debounce_task
            except asyncio.CancelledError:
                pass
        
        # Create new debounce task
        self._debounce_task = asyncio.create_task(
            self._debounced_recalculation()
        )
    
    async def _debounced_recalculation(self) -> None:
        """
        Internal method that waits for debounce window then triggers recalculation.
        """
        try:
            # Wait for debounce window
            await asyncio.sleep(self.DEBOUNCE_SECONDS)
            
            # Collect and clear pending trigger sources
            trigger_sources = self._pending_trigger_sources.copy()
            self._pending_trigger_sources.clear()
            self._pending_recalc = False
            
            # Combine trigger sources for logging
            combined_source = ','.join(set(trigger_sources)) if trigger_sources else 'unknown'
            
            # Increment recalculation count
            self._recalculation_count += 1
            
            # Execute the recalculation callback if set
            if self._recalculation_callback is not None:
                await self._recalculation_callback(combined_source)
            
        except asyncio.CancelledError:
            # Task was cancelled due to new queue_recalculation call
            raise
    
    async def force_recalculation(self, trigger_source: str = 'manual_refresh') -> None:
        """
        Forces immediate analytics recalculation, bypassing the debounce window.
        
        This is used for manual refresh requests where the user expects
        immediate results.
        
        Args:
            trigger_source: What triggered this recalculation (default: 'manual_refresh')
        
        Requirements: 4.3 - Manual refresh triggers immediate calculation
        """
        # Cancel any pending debounce task
        if self._debounce_task is not None and not self._debounce_task.done():
            self._debounce_task.cancel()
            try:
                await self._debounce_task
            except asyncio.CancelledError:
                pass
        
        # Clear pending state
        self._pending_trigger_sources.clear()
        self._pending_recalc = False
        
        # Increment recalculation count
        self._recalculation_count += 1
        
        # Execute immediately without waiting
        if self._recalculation_callback is not None:
            await self._recalculation_callback(trigger_source)
    
    @property
    def is_recalculation_pending(self) -> bool:
        """Returns True if a recalculation is pending in the debounce window."""
        return self._pending_recalc
    
    @property
    def pending_trigger_count(self) -> int:
        """Returns the number of pending trigger sources in the debounce window."""
        return len(self._pending_trigger_sources)
    
    @property
    def recalculation_count(self) -> int:
        """Returns the total number of recalculations triggered (for testing)."""
        return self._recalculation_count
    
    def reset_recalculation_count(self) -> None:
        """Resets the recalculation count (for testing)."""
        self._recalculation_count = 0
    
    def set_analytics_service(self, analytics_service) -> None:
        """
        Sets the AnalyticsService instance for background processing.
        
        Args:
            analytics_service: Instance of AnalyticsService to use for calculations.
        """
        self._analytics_service = analytics_service
    
    def reset_retry_attempts(self) -> None:
        """Resets the retry attempts tracking (for testing)."""
        self._retry_attempts = []
    
    @property
    def retry_attempts(self) -> list[Dict[str, Any]]:
        """Returns the list of retry attempts (for testing)."""
        return self._retry_attempts
    
    async def process_analytics_background(
        self, 
        trigger_source: str,
        metric_type: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Background worker that processes analytics and updates the cache.
        
        This method:
        1. Logs the start time and trigger source (Requirement 2.3)
        2. Calls AnalyticsService.get_dashboard_metrics()
        3. Measures calculation duration
        4. Updates the cache with new metrics (Requirement 2.4)
        5. Retries on failure with exponential backoff (Requirement 2.5)
        
        Args:
            trigger_source: What triggered this calculation (e.g., 'message_webhook')
            metric_type: Type of metrics to calculate (default: 'dashboard')
            
        Returns:
            The updated cache entry, or None on failure after all retries.
            
        Requirements: 2.3 - Log start time and trigger source
        Requirements: 2.4 - Update Analytics_Cache with new Metric_Snapshot
        Requirements: 2.5 - Retry up to 3 times with exponential backoff
        """
        if metric_type is None:
            metric_type = self.DEFAULT_METRIC_TYPE
        
        if self._analytics_service is None:
            logger.error("AnalyticsService not set. Call set_analytics_service() first.")
            return None
        
        last_error = None
        
        for attempt in range(self.MAX_RETRIES):
            try:
                # Log start time and trigger source (Requirement 2.3)
                start_time = datetime.now(timezone.utc)
                start_timestamp_ms = time.time() * 1000
                
                logger.info(
                    f"Starting analytics calculation - "
                    f"trigger_source={trigger_source}, "
                    f"metric_type={metric_type}, "
                    f"start_time={start_time.isoformat()}, "
                    f"attempt={attempt + 1}/{self.MAX_RETRIES}"
                )
                
                # Track retry attempt for testing
                self._retry_attempts.append({
                    'attempt': attempt + 1,
                    'trigger_source': trigger_source,
                    'start_time': start_time.isoformat(),
                    'status': 'started'
                })
                
                # Call AnalyticsService to get metrics
                # Note: get_dashboard_metrics is synchronous, run in executor
                loop = asyncio.get_event_loop()
                metrics = await loop.run_in_executor(
                    None, 
                    self._analytics_service.get_dashboard_metrics
                )
                
                # Check for error in metrics
                if metrics and 'error' in metrics:
                    raise Exception(f"Analytics calculation error: {metrics['error']}")
                
                # Calculate duration
                end_timestamp_ms = time.time() * 1000
                duration_ms = int(end_timestamp_ms - start_timestamp_ms)
                
                logger.info(
                    f"Analytics calculation completed - "
                    f"duration_ms={duration_ms}, "
                    f"trigger_source={trigger_source}"
                )
                
                # Update retry attempt status
                self._retry_attempts[-1]['status'] = 'success'
                self._retry_attempts[-1]['duration_ms'] = duration_ms
                
                # Update cache with new metrics (Requirement 2.4)
                result = self.update_cache(
                    metrics=metrics,
                    trigger_source=trigger_source,
                    duration_ms=duration_ms,
                    metric_type=metric_type
                )
                
                return result
                
            except Exception as e:
                last_error = e
                logger.error(
                    f"Analytics calculation failed - "
                    f"attempt={attempt + 1}/{self.MAX_RETRIES}, "
                    f"error={str(e)}"
                )
                
                # Update retry attempt status
                if self._retry_attempts:
                    self._retry_attempts[-1]['status'] = 'failed'
                    self._retry_attempts[-1]['error'] = str(e)
                
                # If not the last attempt and retry is enabled, wait with exponential backoff
                if attempt < self.MAX_RETRIES - 1 and self._retry_enabled:
                    delay = self.RETRY_BASE_DELAY_SECONDS * (2 ** attempt)
                    logger.info(f"Retrying in {delay} seconds...")
                    await asyncio.sleep(delay)
        
        # All retries exhausted
        logger.error(
            f"Analytics calculation failed after {self.MAX_RETRIES} attempts - "
            f"last_error={str(last_error)}"
        )
        return None
    
    def create_background_worker_callback(self) -> Callable[[str], Awaitable[None]]:
        """
        Creates a callback function for the debounce mechanism that uses
        the background worker for processing.
        
        Returns:
            Async callback function that processes analytics in background.
        """
        async def worker_callback(trigger_source: str) -> None:
            await self.process_analytics_background(trigger_source)
        
        return worker_callback
    
    def setup_background_processing(self, analytics_service=None) -> None:
        """
        Convenience method to set up background processing with the worker callback.
        
        Args:
            analytics_service: Optional AnalyticsService instance. If not provided,
                             uses the one set via constructor or set_analytics_service().
        """
        if analytics_service is not None:
            self._analytics_service = analytics_service
        
        # Set the recalculation callback to use the background worker
        self.set_recalculation_callback(self.create_background_worker_callback())
    
    def get_cached_metrics(self, metric_type: str = None) -> Optional[Dict[str, Any]]:
        """
        Retrieves cached metrics from the analytics_cache table.
        
        Args:
            metric_type: Type of metrics to retrieve (default: 'dashboard')
            
        Returns:
            Dictionary with cached metrics and metadata, or None if not found.
            Includes 'is_stale' flag based on calculated_at timestamp.
            
        Requirements: 1.1 - Provide cached metrics within 100ms
        """
        if metric_type is None:
            metric_type = self.DEFAULT_METRIC_TYPE
            
        try:
            result = (
                self.supabase
                .table("analytics_cache")
                .select("*")
                .eq("metric_type", metric_type)
                .order("calculated_at", direction="desc")
                .limit(1)
                .execute()
            )
            
            if not result.data or len(result.data) == 0:
                return None
            
            cache_entry = result.data[0]
            
            # Add is_stale flag based on calculated_at
            is_stale = self.is_cache_stale(cache_entry)
            cache_entry['is_stale'] = is_stale
            
            return cache_entry
            
        except Exception as e:
            print(f"Error fetching cached metrics: {e}")
            return None
    
    def update_cache(
        self,
        metrics: Dict[str, Any],
        trigger_source: str,
        duration_ms: int,
        metric_type: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Updates the analytics cache, preserving the previous snapshot.
        
        Args:
            metrics: The new metrics data to cache
            trigger_source: What triggered this update (e.g., 'message_webhook', 'manual_refresh')
            duration_ms: How long the calculation took in milliseconds
            metric_type: Type of metrics being cached (default: 'dashboard')
            
        Returns:
            The newly created cache entry, or None on failure.
            
        Requirements: 3.1 - Include timestamp and calculation duration
        Requirements: 3.3 - Preserve previous snapshot for comparison
        """
        if metric_type is None:
            metric_type = self.DEFAULT_METRIC_TYPE
            
        try:
            # Get current cache entry to preserve as previous_data
            current_entry = self.get_cached_metrics(metric_type)
            previous_data = None
            
            if current_entry:
                # Extract just the data field from current entry
                previous_data = current_entry.get('data')
            
            # Prepare new cache entry
            now = datetime.now(timezone.utc)
            new_entry = {
                'metric_type': metric_type,
                'data': metrics,
                'calculated_at': now.isoformat(),
                'calculation_duration_ms': duration_ms,
                'trigger_source': trigger_source,
                'previous_data': previous_data,
                'updated_at': now.isoformat()
            }
            
            # Check if entry exists for this metric_type
            if current_entry and 'id' in current_entry:
                # Update existing entry
                result = (
                    self.supabase
                    .table("analytics_cache")
                    .update(new_entry)
                    .eq("id", current_entry['id'])
                    .execute()
                )
            else:
                # Insert new entry
                new_entry['created_at'] = now.isoformat()
                result = (
                    self.supabase
                    .table("analytics_cache")
                    .insert(new_entry)
                    .execute()
                )
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            
            return None
            
        except Exception as e:
            print(f"Error updating analytics cache: {e}")
            return None
    
    def is_cache_stale(
        self,
        cache_entry: Dict[str, Any],
        max_age_minutes: int = None
    ) -> bool:
        """
        Checks if a cache entry is stale (older than threshold).
        
        Args:
            cache_entry: The cache entry to check
            max_age_minutes: Maximum age in minutes before considered stale (default: 5)
            
        Returns:
            True if cache is stale, False otherwise.
            
        Requirements: 4.2 - Display visual indicator when cache is older than 5 minutes
        """
        if max_age_minutes is None:
            max_age_minutes = self.STALE_THRESHOLD_MINUTES
            
        if not cache_entry:
            return True
            
        calculated_at_str = cache_entry.get('calculated_at')
        if not calculated_at_str:
            return True
        
        try:
            # Parse the timestamp
            if isinstance(calculated_at_str, str):
                # Handle ISO format with timezone
                calculated_at = datetime.fromisoformat(
                    calculated_at_str.replace('Z', '+00:00')
                )
            else:
                calculated_at = calculated_at_str
            
            # Ensure timezone awareness
            if calculated_at.tzinfo is None:
                calculated_at = calculated_at.replace(tzinfo=timezone.utc)
            
            now = datetime.now(timezone.utc)
            age = now - calculated_at
            threshold = timedelta(minutes=max_age_minutes)
            
            return age > threshold
            
        except Exception as e:
            print(f"Error checking cache staleness: {e}")
            # If we can't determine, assume stale for safety
            return True
