"""
Property-Based Test: compute_em_atendimento is bounded by total leads.

**Feature: fix-crm-analytics-bugs, Property 7: compute_em_atendimento is bounded by total leads**
**Validates: Requirements 1.2**

For any leads DataFrame and conversations DataFrame, compute_em_atendimento
SHALL return a value that is >= 0 and <= the number of rows in the leads DataFrame.
"""

import sys
import os

import pandas as pd
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.analytics_computations import compute_em_atendimento


# -- Strategies --

lead_id_st = st.uuids().map(str)

# Conversations may reference lead_ids that do NOT exist in the leads DF.
# This is the interesting edge case: the function must still be bounded.
def conversations_st(known_ids, extra_ids):
    """Generate conversations referencing both known and unknown lead_ids."""
    all_ids = known_ids + extra_ids
    if not all_ids:
        return st.just([])
    return st.lists(
        st.fixed_dictionaries({
            "id": st.uuids().map(str),
            "lead_id": st.sampled_from(all_ids),
        }),
        min_size=0,
        max_size=max(len(all_ids) * 2, 5),
    )


class TestEmAtendimentoBounded:
    """
    **Feature: fix-crm-analytics-bugs, Property 7: compute_em_atendimento is bounded by total leads**
    **Validates: Requirements 1.2**
    """

    @settings(max_examples=100)
    @given(
        lead_ids=st.lists(lead_id_st, min_size=0, max_size=30, unique=True),
        extra_ids=st.lists(lead_id_st, min_size=0, max_size=10, unique=True),
        data=st.data(),
    )
    def test_em_atendimento_bounded_by_total_leads(self, lead_ids, extra_ids, data):
        """
        **Feature: fix-crm-analytics-bugs, Property 7: compute_em_atendimento is bounded by total leads**
        **Validates: Requirements 1.2**

        For any leads DataFrame and conversations DataFrame (including conversations
        that reference lead_ids not present in leads), compute_em_atendimento returns
        a value >= 0 and <= len(df_leads).
        """
        df_leads = (
            pd.DataFrame([{"id": lid, "status": "novo"} for lid in lead_ids])
            if lead_ids
            else pd.DataFrame(columns=["id", "status"])
        )

        conversations = data.draw(conversations_st(lead_ids, extra_ids))
        df_convs = (
            pd.DataFrame(conversations)
            if conversations
            else pd.DataFrame(columns=["id", "lead_id"])
        )

        result = compute_em_atendimento(df_leads, df_convs)

        assert isinstance(result, int), f"Expected int, got {type(result)}"
        assert result >= 0, f"em_atendimento={result} is negative"
        assert result <= len(df_leads), (
            f"em_atendimento={result} exceeds total_leads={len(df_leads)}"
        )
