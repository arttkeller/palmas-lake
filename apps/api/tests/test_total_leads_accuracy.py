"""
Property-Based Test for backend metrics total_leads accuracy.

**Feature: fix-analytics-data-display, Property 3: Backend metrics total_leads accuracy**
**Validates: Requirements 2.3**

For any set of leads in the database, the AnalyticsService.get_dashboard_metrics()
SHALL return total_leads equal to the actual count of leads.
"""

import sys
import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings, strategies as st

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.analytics_computations import STATUS_TO_STAGE

# --- Strategies ---

valid_statuses = st.sampled_from(list(STATUS_TO_STAGE.keys()))
source_values = st.sampled_from(["whatsapp", "instagram", "site", "indicacao"])


def lead_strategy():
    """Generate a single lead dict matching the Supabase leads schema."""
    return st.fixed_dictionaries({
        "id": st.uuids().map(str),
        "status": valid_statuses,
        "source": source_values,
        "full_name": st.text(min_size=1, max_size=20),
        "phone": st.text(min_size=8, max_size=15),
        "notes": st.just(""),
        "created_at": st.datetimes(
            min_value=datetime(2025, 1, 1),
            max_value=datetime(2025, 12, 31),
            timezones=st.just(timezone.utc),
        ).map(lambda d: d.isoformat()),
    })


def leads_list_strategy(min_size=1, max_size=30):
    return st.lists(lead_strategy(), min_size=min_size, max_size=max_size)


class TestTotalLeadsAccuracy:
    """
    **Feature: fix-analytics-data-display, Property 3: Backend metrics total_leads accuracy**
    **Validates: Requirements 2.3**
    """

    @settings(max_examples=100, deadline=None)
    @given(leads=leads_list_strategy(min_size=1, max_size=30))
    def test_total_leads_equals_actual_count(self, leads):
        """
        **Feature: fix-analytics-data-display, Property 3: Backend metrics total_leads accuracy**
        **Validates: Requirements 2.3**

        For any generated set of leads, total_leads in the result
        equals len(leads).
        """
        from services.analytics_service import AnalyticsService

        service = AnalyticsService()

        leads_response = MagicMock()
        leads_response.data = leads

        empty_response = MagicMock()
        empty_response.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            if table_name == "leads":
                mock_table.select.return_value.execute.return_value = leads_response
            elif table_name == "conversations":
                mock_table.select.return_value.execute.return_value = empty_response
                mock_table.select.return_value.eq.return_value.execute.return_value = empty_response
            elif table_name == "messages":
                chain = mock_table.select.return_value
                chain.eq.return_value.order.return_value.limit.return_value.execute.return_value = empty_response
                chain.order.return_value.limit.return_value.execute.return_value = empty_response
            else:
                mock_table.select.return_value.execute.return_value = empty_response
            return mock_table

        with patch.object(service, "supabase") as mock_sb:
            mock_sb.table.side_effect = table_router
            result = service.get_dashboard_metrics()

        assert result["total_leads"] == len(leads), (
            f"Expected total_leads={len(leads)}, got {result['total_leads']}"
        )

    def test_empty_leads_returns_zero(self):
        """
        **Feature: fix-analytics-data-display, Property 3: Backend metrics total_leads accuracy**
        **Validates: Requirements 2.3**

        When no leads exist, total_leads should be 0.
        """
        from services.analytics_service import AnalyticsService

        service = AnalyticsService()

        empty_response = MagicMock()
        empty_response.data = []

        def table_router(table_name):
            mock_table = MagicMock()
            mock_table.select.return_value.execute.return_value = empty_response
            mock_table.select.return_value.eq.return_value.execute.return_value = empty_response
            return mock_table

        with patch.object(service, "supabase") as mock_sb:
            mock_sb.table.side_effect = table_router
            result = service.get_dashboard_metrics()

        assert result["total_leads"] == 0
