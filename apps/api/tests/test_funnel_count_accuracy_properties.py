"""
Property-Based Tests for funnel count accuracy (em_atendimento and total_leads).

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
**Validates: Requirements 6.1, 6.2, 6.3**
"""

import sys
import os
from datetime import datetime, timezone

import pytest
import pandas as pd
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.analytics_computations import compute_em_atendimento


# =============================================================================
# Strategies / Generators
# =============================================================================

def lead_id_strategy():
    """Generate a lead ID string."""
    return st.uuids().map(str)


def leads_df_strategy(lead_ids):
    """Build a DataFrame of leads from a list of IDs."""
    rows = [{"id": lid, "status": "novo"} for lid in lead_ids]
    return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["id", "status"])


def conversations_strategy(lead_ids, max_convs_per_lead=3):
    """
    Generate a list of conversation dicts referencing a subset of lead_ids.
    A single lead can have multiple conversations (duplicates in lead_id).
    """
    if not lead_ids:
        return st.just([])
    return st.lists(
        st.fixed_dictionaries({
            "id": st.uuids().map(str),
            "lead_id": st.sampled_from(lead_ids),
        }),
        min_size=0,
        max_size=len(lead_ids) * max_convs_per_lead,
    )


# =============================================================================
# Property 5: Funnel count accuracy
# **Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
# **Validates: Requirements 6.1, 6.2, 6.3**
# =============================================================================

class TestFunnelCountAccuracy:
    """
    **Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
    **Validates: Requirements 6.1, 6.2, 6.3**
    """

    @settings(max_examples=100)
    @given(
        lead_ids=st.lists(lead_id_strategy(), min_size=1, max_size=30, unique=True),
        data=st.data(),
    )
    def test_em_atendimento_equals_distinct_lead_ids(self, lead_ids, data):
        """
        **Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
        **Validates: Requirements 6.1, 6.2, 6.3**

        For any set of leads and conversations, em_atendimento equals
        the number of distinct lead_ids that appear in conversations.
        """
        conversations = data.draw(conversations_strategy(lead_ids))
        df_leads = leads_df_strategy(lead_ids)
        df_convs = pd.DataFrame(conversations) if conversations else pd.DataFrame(columns=["id", "lead_id"])

        em_atendimento = compute_em_atendimento(df_leads, df_convs)

        expected_distinct = df_convs["lead_id"].nunique() if not df_convs.empty else 0
        # Capped at total leads
        expected = min(expected_distinct, len(lead_ids))

        assert em_atendimento == expected, (
            f"em_atendimento={em_atendimento} != expected distinct lead_ids={expected}"
        )

    @settings(max_examples=100)
    @given(
        lead_ids=st.lists(lead_id_strategy(), min_size=1, max_size=30, unique=True),
        data=st.data(),
    )
    def test_em_atendimento_never_exceeds_total_leads(self, lead_ids, data):
        """
        **Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
        **Validates: Requirements 6.1, 6.2, 6.3**

        For any set of leads and conversations, em_atendimento
        never exceeds total_leads.
        """
        conversations = data.draw(conversations_strategy(lead_ids))
        df_leads = leads_df_strategy(lead_ids)
        df_convs = pd.DataFrame(conversations) if conversations else pd.DataFrame(columns=["id", "lead_id"])

        em_atendimento = compute_em_atendimento(df_leads, df_convs)
        total_leads = len(df_leads)

        assert em_atendimento <= total_leads, (
            f"em_atendimento={em_atendimento} exceeds total_leads={total_leads}"
        )

    @settings(max_examples=100)
    @given(
        lead_ids=st.lists(lead_id_strategy(), min_size=1, max_size=30, unique=True),
    )
    def test_em_atendimento_zero_when_no_conversations(self, lead_ids):
        """
        **Feature: crm-agent-bugfixes, Property 5: Funnel count accuracy**
        **Validates: Requirements 6.1, 6.2, 6.3**

        When there are no conversations, em_atendimento is 0.
        """
        df_leads = leads_df_strategy(lead_ids)
        df_convs = pd.DataFrame(columns=["id", "lead_id"])

        em_atendimento = compute_em_atendimento(df_leads, df_convs)

        assert em_atendimento == 0, (
            f"em_atendimento should be 0 with no conversations, got {em_atendimento}"
        )
