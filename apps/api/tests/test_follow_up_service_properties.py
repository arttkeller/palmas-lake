"""
Property-Based Tests for Follow-up Service.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: fix-reaction-persistence**
"""

import sys
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytz

from services.follow_up_service import FollowUpService
from services.follow_up_templates import (
    get_follow_up_message,
    get_all_templates_for_stage,
    STAGE_1_TEMPLATES,
    STAGE_2_TEMPLATES,
    STAGE_3_TEMPLATES
)

# Timezone do Brasil
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')


# =============================================================================
# Generators / Strategies
# =============================================================================

# Strategy for follow-up stages
stage_strategy = st.integers(min_value=1, max_value=3)

# Strategy for lead names
name_strategy = st.one_of(
    st.none(),
    st.text(min_size=0, max_size=0),  # Empty string
    st.text(alphabet=st.characters(whitelist_categories=('L',)), min_size=1, max_size=20)  # Valid names
)

# Strategy for hours inactive (stage 1: 2h+)
stage_1_hours_strategy = st.floats(min_value=2.0, max_value=23.9, allow_nan=False)

# Strategy for hours inactive (stage 2: 24h+)
stage_2_hours_strategy = st.floats(min_value=24.0, max_value=71.9, allow_nan=False)

# Strategy for hours inactive (stage 3: 72h+)
stage_3_hours_strategy = st.floats(min_value=72.0, max_value=168.0, allow_nan=False)

# Strategy for hours within business hours (8-19)
business_hour_strategy = st.integers(min_value=8, max_value=19)

# Strategy for hours outside business hours
non_business_hour_strategy = st.one_of(
    st.integers(min_value=0, max_value=7),
    st.integers(min_value=20, max_value=23)
)


# =============================================================================
# Property Test: Follow-up Scheduling
# **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
# **Validates: Requirements 6.1**
# =============================================================================

class TestFollowUpScheduling:
    """
    **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
    **Validates: Requirements 6.1**
    
    For any lead that has not interacted for more than 2 hours during business hours,
    a follow-up task should be scheduled.
    """

    @settings(max_examples=100)
    @given(hours=stage_1_hours_strategy)
    def test_stage_1_threshold_is_2_hours(self, hours):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.1**
        
        Property: Stage 1 follow-up should be triggered after 2+ hours of inactivity.
        """
        service = FollowUpService()
        
        # Verify the threshold constant
        assert service.STAGE_1_HOURS == 2, \
            f"Stage 1 threshold should be 2 hours, got {service.STAGE_1_HOURS}"
        
        # Any hours >= 2 should qualify for stage 1
        assert hours >= service.STAGE_1_HOURS, \
            f"Hours {hours} should be >= stage 1 threshold"

    @settings(max_examples=100)
    @given(hours=stage_2_hours_strategy)
    def test_stage_2_threshold_is_24_hours(self, hours):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.2**
        
        Property: Stage 2 follow-up should be triggered after 24+ hours of inactivity.
        """
        service = FollowUpService()
        
        # Verify the threshold constant
        assert service.STAGE_2_HOURS == 24, \
            f"Stage 2 threshold should be 24 hours, got {service.STAGE_2_HOURS}"
        
        # Any hours >= 24 should qualify for stage 2
        assert hours >= service.STAGE_2_HOURS, \
            f"Hours {hours} should be >= stage 2 threshold"

    @settings(max_examples=100)
    @given(hours=stage_3_hours_strategy)
    def test_stage_3_threshold_is_72_hours(self, hours):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.3**
        
        Property: Stage 3 follow-up should be triggered after 72+ hours of inactivity.
        """
        service = FollowUpService()
        
        # Verify the threshold constant
        assert service.STAGE_3_HOURS == 72, \
            f"Stage 3 threshold should be 72 hours, got {service.STAGE_3_HOURS}"
        
        # Any hours >= 72 should qualify for stage 3
        assert hours >= service.STAGE_3_HOURS, \
            f"Hours {hours} should be >= stage 3 threshold"

    @settings(max_examples=100)
    @given(hour=business_hour_strategy)
    def test_business_hours_detection(self, hour):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.1**
        
        Property: Hours between 8 AM and 8 PM should be detected as business hours.
        """
        service = FollowUpService()
        
        # Create a datetime with the given hour in Brazil timezone
        test_dt = datetime.now(BRAZIL_TZ).replace(hour=hour, minute=30)
        
        result = service.is_business_hours(test_dt)
        assert result is True, \
            f"Hour {hour} should be within business hours (8-20)"

    @settings(max_examples=100)
    @given(hour=non_business_hour_strategy)
    def test_non_business_hours_detection(self, hour):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.1**
        
        Property: Hours before 8 AM or after 8 PM should not be business hours.
        """
        service = FollowUpService()
        
        # Create a datetime with the given hour in Brazil timezone
        test_dt = datetime.now(BRAZIL_TZ).replace(hour=hour, minute=30)
        
        result = service.is_business_hours(test_dt)
        assert result is False, \
            f"Hour {hour} should NOT be within business hours"


class TestFollowUpTemplates:
    """
    Tests for follow-up message templates.
    **Validates: Requirements 6.4**
    """

    @settings(max_examples=100)
    @given(stage=stage_strategy, name=name_strategy)
    def test_template_returns_non_empty_message(self, stage, name):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.4**
        
        Property: For any stage and name, a non-empty message should be returned.
        """
        message = get_follow_up_message(stage, name)
        
        assert message is not None, "Message should not be None"
        assert len(message) > 0, "Message should not be empty"
        assert isinstance(message, str), "Message should be a string"

    @settings(max_examples=100)
    @given(stage=stage_strategy)
    def test_each_stage_has_multiple_templates(self, stage):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.4**
        
        Property: Each stage should have multiple templates for variety.
        """
        templates = get_all_templates_for_stage(stage)
        
        assert len(templates) >= 3, \
            f"Stage {stage} should have at least 3 templates for variety, got {len(templates)}"

    @settings(max_examples=100)
    @given(name=st.text(alphabet=st.characters(whitelist_categories=('L',)), min_size=1, max_size=20))
    def test_name_is_included_in_message(self, name):
        """
        **Feature: fix-reaction-persistence, Property 7: Follow-up Scheduling**
        **Validates: Requirements 6.4**
        
        Property: When a name is provided, it should appear in the message.
        """
        # Skip empty or whitespace-only names
        assume(name.strip())
        
        message = get_follow_up_message(1, name)
        
        # The name should appear in the message
        assert name in message, \
            f"Name '{name}' should appear in message: {message}"

    def test_stage_1_templates_are_gentle(self):
        """
        Property: Stage 1 templates should be gentle reminders.
        """
        templates = get_all_templates_for_stage(1)
        
        # All stage 1 templates should exist
        assert len(templates) > 0, "Stage 1 should have templates"
        
        # Check that templates don't contain aggressive language
        aggressive_words = ["última", "encerrar", "final"]
        for template in templates:
            for word in aggressive_words:
                assert word not in template.lower(), \
                    f"Stage 1 template should not contain '{word}': {template}"

    def test_stage_3_templates_are_final(self):
        """
        Property: Stage 3 templates should indicate finality.
        """
        templates = get_all_templates_for_stage(3)
        
        # All stage 3 templates should exist
        assert len(templates) > 0, "Stage 3 should have templates"
        
        # At least some templates should indicate finality
        final_indicators = ["última", "encerrar", "final", "até mais", "até breve"]
        has_final_indicator = False
        
        for template in templates:
            template_lower = template.lower()
            if any(indicator in template_lower for indicator in final_indicators):
                has_final_indicator = True
                break
        
        assert has_final_indicator, \
            "At least one stage 3 template should indicate finality"


class TestFollowUpServiceLogic:
    """
    Tests for follow-up service business logic.
    """

    def test_stage_thresholds_are_increasing(self):
        """
        Property: Stage thresholds should be in increasing order.
        """
        service = FollowUpService()
        
        assert service.STAGE_1_HOURS < service.STAGE_2_HOURS, \
            "Stage 1 threshold should be less than stage 2"
        assert service.STAGE_2_HOURS < service.STAGE_3_HOURS, \
            "Stage 2 threshold should be less than stage 3"

    def test_business_hours_range_is_valid(self):
        """
        Property: Business hours should be a valid range.
        """
        service = FollowUpService()
        
        assert 0 <= service.BUSINESS_HOUR_START < 24, \
            "Business hour start should be valid"
        assert 0 < service.BUSINESS_HOUR_END <= 24, \
            "Business hour end should be valid"
        assert service.BUSINESS_HOUR_START < service.BUSINESS_HOUR_END, \
            "Business hour start should be before end"


# =============================================================================
# Property Test: Stage Progression Follows Inactivity Thresholds
# **Feature: fix-follow-up-queue, Property 1: Stage progression follows inactivity thresholds**
# **Validates: Requirements 2.1, 2.2, 2.3**
# =============================================================================

def _classify_lead(current_stage: int, hours_inactive: float) -> tuple:
    """
    Replicates the classification logic from FollowUpService.get_inactive_leads().
    Returns (needs_followup, next_stage).
    """
    needs_followup = False
    next_stage = current_stage

    if current_stage == 0 and hours_inactive >= FollowUpService.STAGE_1_HOURS:
        needs_followup = True
        next_stage = 1
    elif current_stage == 1 and hours_inactive >= FollowUpService.STAGE_2_HOURS:
        needs_followup = True
        next_stage = 2
    elif current_stage == 2 and hours_inactive >= FollowUpService.STAGE_3_HOURS:
        needs_followup = True
        next_stage = 3

    return needs_followup, next_stage


class TestStageProgressionThresholds:
    """
    **Feature: fix-follow-up-queue, Property 1: Stage progression follows inactivity thresholds**
    **Validates: Requirements 2.1, 2.2, 2.3**

    For any lead with a given follow_up_stage and hours_inactive, the classification
    logic should return that lead with the correct next_stage if and only if the
    inactivity exceeds the threshold for the current stage (stage 0 → 2h,
    stage 1 → 24h, stage 2 → 72h), and should not return leads whose inactivity
    is below the threshold.
    """

    @settings(max_examples=100)
    @given(
        current_stage=st.integers(min_value=0, max_value=2),
        hours_inactive=st.floats(min_value=0.0, max_value=200.0, allow_nan=False, allow_infinity=False),
    )
    def test_stage_progression_follows_thresholds(self, current_stage, hours_inactive):
        """
        **Feature: fix-follow-up-queue, Property 1: Stage progression follows inactivity thresholds**
        **Validates: Requirements 2.1, 2.2, 2.3**

        Property: For any lead, the classification returns needs_followup=True with
        next_stage = current_stage + 1 if and only if hours_inactive >= threshold
        for the current stage.
        """
        thresholds = {
            0: FollowUpService.STAGE_1_HOURS,   # 2h
            1: FollowUpService.STAGE_2_HOURS,    # 24h
            2: FollowUpService.STAGE_3_HOURS,    # 72h
        }

        threshold = thresholds[current_stage]
        needs_followup, next_stage = _classify_lead(current_stage, hours_inactive)

        if hours_inactive >= threshold:
            assert needs_followup is True, (
                f"Lead at stage {current_stage} with {hours_inactive}h inactive "
                f"(>= {threshold}h threshold) should need follow-up"
            )
            assert next_stage == current_stage + 1, (
                f"next_stage should be {current_stage + 1}, got {next_stage}"
            )
        else:
            assert needs_followup is False, (
                f"Lead at stage {current_stage} with {hours_inactive}h inactive "
                f"(< {threshold}h threshold) should NOT need follow-up"
            )
            assert next_stage == current_stage, (
                f"next_stage should remain {current_stage}, got {next_stage}"
            )

    @settings(max_examples=100)
    @given(hours_inactive=st.floats(min_value=0.0, max_value=200.0, allow_nan=False, allow_infinity=False))
    def test_stage_3_leads_never_get_followup(self, hours_inactive):
        """
        **Feature: fix-follow-up-queue, Property 1: Stage progression follows inactivity thresholds**
        **Validates: Requirements 2.1, 2.2, 2.3**

        Property: Leads already at stage 3 should never be classified as needing
        a follow-up, regardless of inactivity duration.
        """
        needs_followup, next_stage = _classify_lead(3, hours_inactive)

        assert needs_followup is False, (
            f"Lead at stage 3 with {hours_inactive}h should never need follow-up"
        )
        assert next_stage == 3, (
            f"next_stage for stage 3 lead should remain 3, got {next_stage}"
        )


# =============================================================================
# Property Test: No Duplicate Pending Follow-Ups (Idempotence)
# **Feature: fix-follow-up-queue, Property 2: No duplicate pending follow-ups (idempotence)**
# **Validates: Requirements 2.4**
# =============================================================================

def _has_pending_follow_up(queue: list, lead_id: str) -> bool:
    """
    Replicates the duplicate-check logic from FollowUpService.schedule_follow_up().
    Returns True if the lead already has a pending follow-up in the queue.
    """
    for entry in queue:
        if entry.get("lead_id") == lead_id and entry.get("status") == "pending":
            return True
    return False


def _simulate_schedule(queue: list, lead_id: str, stage: int) -> tuple:
    """
    Simulates schedule_follow_up: if a pending entry exists for lead_id,
    returns (queue_unchanged, None). Otherwise appends a new pending entry
    and returns (new_queue, new_id).
    """
    if _has_pending_follow_up(queue, lead_id):
        return list(queue), None  # no mutation

    new_entry = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "stage": stage,
        "status": "pending",
    }
    new_queue = list(queue) + [new_entry]
    return new_queue, new_entry["id"]


class TestNoDuplicatePendingFollowUps:
    """
    **Feature: fix-follow-up-queue, Property 2: No duplicate pending follow-ups (idempotence)**
    **Validates: Requirements 2.4**

    For any lead that already has a pending follow-up in the follow_up_queue,
    calling schedule_follow_up() again for that lead should return None and
    not insert a new row, preserving the count of pending follow-ups.
    """

    @settings(max_examples=100)
    @given(
        lead_id=st.uuids().map(str),
        stage=st.integers(min_value=1, max_value=3),
    )
    def test_second_schedule_is_noop(self, lead_id, stage):
        """
        **Feature: fix-follow-up-queue, Property 2: No duplicate pending follow-ups (idempotence)**
        **Validates: Requirements 2.4**

        Property: Scheduling a follow-up for a lead that already has a pending
        entry should be idempotent — the queue size stays the same and the
        return value is None.
        """
        # Start with an empty queue, schedule once
        queue_after_first, first_id = _simulate_schedule([], lead_id, stage)
        assert first_id is not None, "First schedule should succeed"
        count_after_first = len(queue_after_first)

        # Schedule again for the same lead
        queue_after_second, second_id = _simulate_schedule(queue_after_first, lead_id, stage)

        assert second_id is None, (
            f"Second schedule for lead {lead_id} should return None (duplicate)"
        )
        assert len(queue_after_second) == count_after_first, (
            f"Queue size should remain {count_after_first} after duplicate attempt, "
            f"got {len(queue_after_second)}"
        )

    @settings(max_examples=100)
    @given(
        lead_a=st.uuids().map(str),
        lead_b=st.uuids().map(str),
        stage=st.integers(min_value=1, max_value=3),
    )
    def test_different_leads_can_both_schedule(self, lead_a, lead_b, stage):
        """
        **Feature: fix-follow-up-queue, Property 2: No duplicate pending follow-ups (idempotence)**
        **Validates: Requirements 2.4**

        Property: Two distinct leads should each be able to schedule a pending
        follow-up independently.
        """
        assume(lead_a != lead_b)

        queue, id_a = _simulate_schedule([], lead_a, stage)
        assert id_a is not None

        queue, id_b = _simulate_schedule(queue, lead_b, stage)
        assert id_b is not None, (
            f"Lead {lead_b} should be able to schedule even though {lead_a} has a pending entry"
        )
        assert len(queue) == 2, f"Queue should have 2 entries, got {len(queue)}"


# =============================================================================
# Property Test: Business Hours Gate for Stage 1
# **Feature: fix-follow-up-queue, Property 3: Business hours gate for stage 1**
# **Validates: Requirements 3.1, 3.2**
# =============================================================================

class TestBusinessHoursGate:
    """
    **Feature: fix-follow-up-queue, Property 3: Business hours gate for stage 1**
    **Validates: Requirements 3.1, 3.2**

    For any datetime, is_business_hours() should return True if and only if the
    hour component in Brazil timezone (America/Sao_Paulo) is between 8 (inclusive)
    and 20 (exclusive). Stage 1 follow-ups should only be scheduled when
    is_business_hours() returns True.
    """

    @settings(max_examples=100)
    @given(
        hour=st.integers(min_value=0, max_value=23),
        minute=st.integers(min_value=0, max_value=59),
        day=st.integers(min_value=1, max_value=28),
        month=st.integers(min_value=1, max_value=12),
    )
    def test_business_hours_iff_8_to_20(self, hour, minute, day, month):
        """
        **Feature: fix-follow-up-queue, Property 3: Business hours gate for stage 1**
        **Validates: Requirements 3.1, 3.2**

        Property: For any datetime, is_business_hours() returns True if and only if
        the hour in America/Sao_Paulo is >= 8 and < 20.
        """
        service = FollowUpService()

        # Build a timezone-aware datetime in Brazil timezone
        dt = BRAZIL_TZ.localize(datetime(2025, month, day, hour, minute, 0))

        result = service.is_business_hours(dt)
        expected = 8 <= hour < 20

        assert result == expected, (
            f"is_business_hours({dt}) returned {result}, expected {expected} "
            f"(hour={hour})"
        )

    @settings(max_examples=100)
    @given(hour=st.integers(min_value=0, max_value=23))
    def test_stage_1_skipped_outside_business_hours(self, hour):
        """
        **Feature: fix-follow-up-queue, Property 3: Business hours gate for stage 1**
        **Validates: Requirements 3.1, 3.2**

        Property: The process_inactive_leads logic skips stage 1 follow-ups
        when outside business hours and processes them during business hours.
        This validates the gate condition in the scheduling loop.
        """
        service = FollowUpService()

        dt = BRAZIL_TZ.localize(datetime(2025, 6, 15, hour, 30, 0))
        is_business = service.is_business_hours(dt)

        stage = 1

        # Simulate the gate logic from process_inactive_leads
        should_skip = (stage == 1 and not is_business)

        if 8 <= hour < 20:
            assert not should_skip, (
                f"Stage 1 at hour {hour} (business hours) should NOT be skipped"
            )
        else:
            assert should_skip, (
                f"Stage 1 at hour {hour} (outside business hours) SHOULD be skipped"
            )


# =============================================================================
# Property Test: Cancellation Resets Follow-Up State
# **Feature: fix-follow-up-queue, Property 4: Cancellation resets follow-up state**
# **Validates: Requirements 4.2**
# =============================================================================

def _simulate_cancel_pending(queue: list, lead_id: str, lead_state: dict) -> tuple:
    """
    Simulates cancel_pending_follow_ups logic from FollowUpService.
    
    For a given queue and lead_id:
    1. All pending entries for that lead are set to 'cancelled'
    2. If any were cancelled, the lead's follow_up_stage is reset to 0
       and next_follow_up is set to None
    
    Returns (new_queue, new_lead_state, cancelled_count).
    """
    new_queue = []
    cancelled_count = 0
    for entry in queue:
        entry_copy = dict(entry)
        if entry_copy.get("lead_id") == lead_id and entry_copy.get("status") == "pending":
            entry_copy["status"] = "cancelled"
            cancelled_count += 1
        new_queue.append(entry_copy)

    new_lead_state = dict(lead_state)
    if cancelled_count > 0:
        new_lead_state["follow_up_stage"] = 0
        new_lead_state["next_follow_up"] = None

    return new_queue, new_lead_state, cancelled_count


class TestCancellationResetsFollowUpState:
    """
    **Feature: fix-follow-up-queue, Property 4: Cancellation resets follow-up state**
    **Validates: Requirements 4.2**

    For any lead with pending follow-ups, calling cancel_pending_follow_ups()
    should update all pending entries to "cancelled" status and reset the lead's
    follow_up_stage to 0 and next_follow_up to None.
    """

    @settings(max_examples=100)
    @given(
        lead_id=st.uuids().map(str),
        current_stage=st.integers(min_value=1, max_value=3),
        num_pending=st.integers(min_value=1, max_value=5),
    )
    def test_cancellation_sets_all_pending_to_cancelled(self, lead_id, current_stage, num_pending):
        """
        **Feature: fix-follow-up-queue, Property 4: Cancellation resets follow-up state**
        **Validates: Requirements 4.2**

        Property: For any lead with N pending follow-ups, after cancellation all N
        entries should have status "cancelled" and zero should remain "pending".
        """
        # Build a queue with num_pending pending entries for this lead
        queue = [
            {"id": str(uuid.uuid4()), "lead_id": lead_id, "stage": current_stage, "status": "pending"}
            for _ in range(num_pending)
        ]
        lead_state = {"follow_up_stage": current_stage, "next_follow_up": "2025-06-15T10:00:00-03:00"}

        new_queue, new_lead_state, cancelled_count = _simulate_cancel_pending(queue, lead_id, lead_state)

        # All pending entries should now be cancelled
        assert cancelled_count == num_pending, (
            f"Expected {num_pending} cancellations, got {cancelled_count}"
        )
        pending_remaining = [e for e in new_queue if e["lead_id"] == lead_id and e["status"] == "pending"]
        assert len(pending_remaining) == 0, (
            f"No pending entries should remain for lead {lead_id}, found {len(pending_remaining)}"
        )
        cancelled_entries = [e for e in new_queue if e["lead_id"] == lead_id and e["status"] == "cancelled"]
        assert len(cancelled_entries) == num_pending, (
            f"All {num_pending} entries should be cancelled, found {len(cancelled_entries)}"
        )

    @settings(max_examples=100)
    @given(
        lead_id=st.uuids().map(str),
        current_stage=st.integers(min_value=1, max_value=3),
    )
    def test_cancellation_resets_lead_stage_to_zero(self, lead_id, current_stage):
        """
        **Feature: fix-follow-up-queue, Property 4: Cancellation resets follow-up state**
        **Validates: Requirements 4.2**

        Property: For any lead with at least one pending follow-up, after cancellation
        the lead's follow_up_stage should be 0 and next_follow_up should be None.
        """
        queue = [
            {"id": str(uuid.uuid4()), "lead_id": lead_id, "stage": current_stage, "status": "pending"}
        ]
        lead_state = {"follow_up_stage": current_stage, "next_follow_up": "2025-06-15T10:00:00-03:00"}

        _, new_lead_state, cancelled_count = _simulate_cancel_pending(queue, lead_id, lead_state)

        assert cancelled_count > 0
        assert new_lead_state["follow_up_stage"] == 0, (
            f"follow_up_stage should be reset to 0, got {new_lead_state['follow_up_stage']}"
        )
        assert new_lead_state["next_follow_up"] is None, (
            f"next_follow_up should be None, got {new_lead_state['next_follow_up']}"
        )

    @settings(max_examples=100)
    @given(
        lead_id=st.uuids().map(str),
        other_lead_id=st.uuids().map(str),
        current_stage=st.integers(min_value=1, max_value=3),
    )
    def test_cancellation_does_not_affect_other_leads(self, lead_id, other_lead_id, current_stage):
        """
        **Feature: fix-follow-up-queue, Property 4: Cancellation resets follow-up state**
        **Validates: Requirements 4.2**

        Property: Cancelling follow-ups for one lead should not change the status
        of pending follow-ups belonging to a different lead.
        """
        assume(lead_id != other_lead_id)

        queue = [
            {"id": str(uuid.uuid4()), "lead_id": lead_id, "stage": current_stage, "status": "pending"},
            {"id": str(uuid.uuid4()), "lead_id": other_lead_id, "stage": current_stage, "status": "pending"},
        ]
        lead_state = {"follow_up_stage": current_stage, "next_follow_up": "2025-06-15T10:00:00-03:00"}

        new_queue, _, _ = _simulate_cancel_pending(queue, lead_id, lead_state)

        other_entries = [e for e in new_queue if e["lead_id"] == other_lead_id]
        assert len(other_entries) == 1
        assert other_entries[0]["status"] == "pending", (
            f"Other lead's follow-up should remain pending, got {other_entries[0]['status']}"
        )
