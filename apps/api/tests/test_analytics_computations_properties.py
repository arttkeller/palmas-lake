"""
Property-Based Tests for analytics computation pure functions.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-bugfixes-analytics**
"""

import sys
import os
import json
from datetime import datetime, timezone, timedelta

import pytest
import pandas as pd
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.analytics_computations import (
    FUNNEL_STAGES,
    STATUS_TO_STAGE,
    compute_funnel_data,
    compute_temperature_distribution,
    compute_source_analysis,
    compute_time_metrics,
)


# =============================================================================
# Strategies / Generators
# =============================================================================

# Valid canonical statuses that map to funnel stages
valid_statuses = st.sampled_from(list(STATUS_TO_STAGE.keys()))

# Temperature values including None
temperature_values = st.sampled_from(["hot", "warm", "cold", None])

# Source values
source_values = st.sampled_from(["whatsapp", "instagram", "site", "indicacao", "facebook"])

# Converted statuses (used in source analysis)
converted_statuses_list = [
    "qualificado", "qualified",
    "visita_agendada", "visit_scheduled",
    "visita_realizada", "visit_done",
    "proposta_enviada", "proposal_sent",
    "venda_realizada", "sold",
]


def lead_strategy():
    """Generate a single lead dict with relevant fields."""
    return st.fixed_dictionaries({
        "id": st.uuids().map(str),
        "status": valid_statuses,
        "temperature": temperature_values,
        "source": source_values,
        "created_at": st.datetimes(
            min_value=datetime(2025, 1, 1),
            max_value=datetime(2026, 2, 1),
            timezones=st.just(timezone.utc),
        ).map(lambda d: d.isoformat()),
    })


def leads_list_strategy(min_size=1, max_size=50):
    """Generate a list of lead dicts."""
    return st.lists(lead_strategy(), min_size=min_size, max_size=max_size)


# =============================================================================
# Property 6: Conversion funnel stage counting
# **Feature: crm-bugfixes-analytics, Property 6: Conversion funnel stage counting**
# **Validates: Requirements 6.2**
# =============================================================================

class TestFunnelCounting:
    """
    **Feature: crm-bugfixes-analytics, Property 6: Conversion funnel stage counting**
    **Validates: Requirements 6.2**
    """

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_funnel_sum_equals_total_leads(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 6: Conversion funnel stage counting**
        **Validates: Requirements 6.2**

        For any list of leads, the sum of all funnel stage counts
        equals the total number of leads.
        """
        df = pd.DataFrame(leads)
        funnel = compute_funnel_data(df)

        total_from_funnel = sum(item["count"] for item in funnel)
        assert total_from_funnel == len(leads), (
            f"Funnel sum {total_from_funnel} != total leads {len(leads)}"
        )

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_funnel_has_all_stages(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 6: Conversion funnel stage counting**
        **Validates: Requirements 6.2**

        The funnel result always contains all canonical stages.
        """
        df = pd.DataFrame(leads)
        funnel = compute_funnel_data(df)

        stages_returned = [item["stage"] for item in funnel]
        assert stages_returned == FUNNEL_STAGES

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_funnel_counts_are_non_negative(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 6: Conversion funnel stage counting**
        **Validates: Requirements 6.2**

        All funnel counts are non-negative integers.
        """
        df = pd.DataFrame(leads)
        funnel = compute_funnel_data(df)

        for item in funnel:
            assert isinstance(item["count"], int)
            assert item["count"] >= 0


# =============================================================================
# Property 7: Temperature distribution counting
# **Feature: crm-bugfixes-analytics, Property 7: Temperature distribution counting**
# **Validates: Requirements 6.3**
# =============================================================================

class TestTemperatureDistribution:
    """
    **Feature: crm-bugfixes-analytics, Property 7: Temperature distribution counting**
    **Validates: Requirements 6.3**
    """

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_temperature_sum_equals_total_leads(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 7: Temperature distribution counting**
        **Validates: Requirements 6.3**

        For any list of leads, the sum of all temperature counts
        equals the total number of leads.
        """
        df = pd.DataFrame(leads)
        dist = compute_temperature_distribution(df)

        total = sum(dist.values())
        assert total == len(leads), (
            f"Temperature sum {total} != total leads {len(leads)}"
        )

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_temperature_counts_are_non_negative(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 7: Temperature distribution counting**
        **Validates: Requirements 6.3**

        All temperature counts are non-negative.
        """
        df = pd.DataFrame(leads)
        dist = compute_temperature_distribution(df)

        for key, count in dist.items():
            assert count >= 0, f"Count for {key} is negative: {count}"


# =============================================================================
# Property 8: Source analysis conversion rates
# **Feature: crm-bugfixes-analytics, Property 8: Source analysis conversion rates**
# **Validates: Requirements 6.4**
# =============================================================================

class TestSourceAnalysis:
    """
    **Feature: crm-bugfixes-analytics, Property 8: Source analysis conversion rates**
    **Validates: Requirements 6.4**
    """

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_conversion_rate_between_0_and_100(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 8: Source analysis conversion rates**
        **Validates: Requirements 6.4**

        For any list of leads grouped by source, the conversion rate
        for each source is between 0 and 100.
        """
        df = pd.DataFrame(leads)
        analysis = compute_source_analysis(df)

        for item in analysis:
            assert 0 <= item["conversion_rate"] <= 100, (
                f"Rate {item['conversion_rate']} out of range for source {item['source']}"
            )

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_source_counts_sum_to_total(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 8: Source analysis conversion rates**
        **Validates: Requirements 6.4**

        The sum of per-source counts equals the total number of leads.
        """
        df = pd.DataFrame(leads)
        analysis = compute_source_analysis(df)

        total = sum(item["count"] for item in analysis)
        assert total == len(leads), (
            f"Source counts sum {total} != total leads {len(leads)}"
        )

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_conversion_rate_matches_manual_calculation(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 8: Source analysis conversion rates**
        **Validates: Requirements 6.4**

        For each source, conversion_rate equals
        (converted / total) * 100 for that source.
        """
        df = pd.DataFrame(leads)
        analysis = compute_source_analysis(df)

        for item in analysis:
            source = item["source"]
            source_leads = [l for l in leads if (l.get("source") or "unknown").strip() == source]
            total = len(source_leads)
            converted = len([
                l for l in source_leads
                if str(l.get("status", "")).strip().lower() in converted_statuses_list
            ])
            expected_rate = round((converted / total * 100), 2) if total > 0 else 0.0
            assert item["conversion_rate"] == expected_rate, (
                f"Source {source}: expected rate {expected_rate}, got {item['conversion_rate']}"
            )


# =============================================================================
# Property 9: Time-based metrics are non-negative
# **Feature: crm-bugfixes-analytics, Property 9: Time-based metrics are non-negative**
# **Validates: Requirements 6.5**
# =============================================================================

class TestTimeMetrics:
    """
    **Feature: crm-bugfixes-analytics, Property 9: Time-based metrics are non-negative**
    **Validates: Requirements 6.5**
    """

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_time_metrics_non_negative(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 9: Time-based metrics are non-negative**
        **Validates: Requirements 6.5**

        For any set of leads and messages with valid timestamps,
        avg_first_response_seconds and lead_velocity are non-negative.
        """
        df_leads = pd.DataFrame(leads)
        # Empty messages — still should return non-negative
        df_messages = pd.DataFrame()

        result = compute_time_metrics(df_leads, df_messages)

        assert result["avg_first_response_seconds"] >= 0, (
            f"avg_first_response_seconds is negative: {result['avg_first_response_seconds']}"
        )
        assert result["lead_velocity"] >= 0, (
            f"lead_velocity is negative: {result['lead_velocity']}"
        )

    @settings(max_examples=100)
    @given(
        leads=leads_list_strategy(min_size=1, max_size=20),
        delay_seconds=st.integers(min_value=1, max_value=3600),
    )
    def test_time_metrics_with_messages_non_negative(self, leads, delay_seconds):
        """
        **Feature: crm-bugfixes-analytics, Property 9: Time-based metrics are non-negative**
        **Validates: Requirements 6.5**

        With generated messages that have AI responses after lead creation,
        all time metrics remain non-negative.
        """
        df_leads = pd.DataFrame(leads)

        # Build synthetic messages: one AI response per lead
        messages = []
        for lead in leads:
            lead_created = datetime.fromisoformat(lead["created_at"])
            messages.append({
                "conversation_id": f"conv-{lead['id']}",
                "lead_id": lead["id"],
                "sender_type": "ai",
                "created_at": (lead_created + timedelta(seconds=delay_seconds)).isoformat(),
            })
        df_messages = pd.DataFrame(messages)

        result = compute_time_metrics(df_leads, df_messages)

        assert result["avg_first_response_seconds"] >= 0
        assert result["lead_velocity"] >= 0


# =============================================================================
# Property 10: Analytics metrics serialization round-trip
# **Feature: crm-bugfixes-analytics, Property 10: Analytics metrics serialization round-trip**
# **Validates: Requirements 6.6, 6.7**
# =============================================================================

class TestSerializationRoundTrip:
    """
    **Feature: crm-bugfixes-analytics, Property 10: Analytics metrics serialization round-trip**
    **Validates: Requirements 6.6, 6.7**
    """

    @settings(max_examples=100)
    @given(leads=leads_list_strategy())
    def test_metrics_round_trip(self, leads):
        """
        **Feature: crm-bugfixes-analytics, Property 10: Analytics metrics serialization round-trip**
        **Validates: Requirements 6.6, 6.7**

        For any valid metrics object produced by the computation functions,
        serializing to JSON and deserializing produces an equivalent object.
        """
        df = pd.DataFrame(leads)

        metrics = {
            "total_leads": len(leads),
            "conversion_rate": 42.5,
            "funnel_data": compute_funnel_data(df),
            "temperature_distribution": compute_temperature_distribution(df),
            "source_analysis": compute_source_analysis(df),
            "avg_first_response_seconds": 120.5,
            "lead_velocity": 3.2,
        }

        serialized = json.dumps(metrics)
        deserialized = json.loads(serialized)

        assert deserialized == metrics, (
            f"Round-trip mismatch:\nOriginal: {metrics}\nDeserialized: {deserialized}"
        )
