"""
Property-Based Tests for Sentiment Trend Aggregation.

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.

**Feature: fix-crm-analytics-bugs, Property 3: Sentiment trend aggregation matches stored labels**
**Validates: Requirements 3.1, 3.2**
"""

import sys
import os

import pandas as pd
import pytest
from hypothesis import given, settings, strategies as st, HealthCheck

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.analytics_computations import compute_sentiment_trend


# =============================================================================
# Generators / Strategies
# =============================================================================

# Sentiment labels in mixed case to test case-insensitivity
sentiment_label_strategy = st.sampled_from([
    "Positivo", "positivo", "POSITIVO",
    "Neutro", "neutro", "NEUTRO",
    "Negativo", "negativo", "NEGATIVO",
])

date_str_strategy = st.dates(
    min_value=pd.Timestamp("2024-01-01").date(),
    max_value=pd.Timestamp("2026-12-31").date(),
).map(lambda d: d.strftime("%Y-%m-%d"))

# A single lead row: date + sentiment_label
lead_row_strategy = st.fixed_dictionaries({
    "date_str": date_str_strategy,
    "sentiment_label": sentiment_label_strategy,
})

# A list of lead rows (at least 1)
leads_strategy = st.lists(lead_row_strategy, min_size=1, max_size=50)


# =============================================================================
# Property Test
# =============================================================================

class TestSentimentTrendAggregation:
    """
    **Feature: fix-crm-analytics-bugs, Property 3: Sentiment trend aggregation matches stored labels**
    **Validates: Requirements 3.1, 3.2**

    For any DataFrame of leads with sentiment_label and date_str columns,
    the sentiment trend computation SHALL produce daily counts where the
    sum of positive, neutral, and negative for each date equals the total
    number of leads on that date, and the label matching SHALL be
    case-insensitive.
    """

    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(leads=leads_strategy)
    def test_daily_counts_sum_to_total(self, leads):
        """
        **Feature: fix-crm-analytics-bugs, Property 3: Sentiment trend aggregation matches stored labels**
        **Validates: Requirements 3.1, 3.2**

        For any set of leads with mixed-case sentiment labels, the sum of
        positive + neutral + negative for each date must equal the total
        number of leads on that date.
        """
        df = pd.DataFrame(leads)
        result = compute_sentiment_trend(df)

        # Build expected counts per date
        expected_per_date = df.groupby("date_str").size().to_dict()

        for entry in result:
            date = entry["date"]
            total = entry["positive"] + entry["neutral"] + entry["negative"]
            assert total == expected_per_date[date], (
                f"On {date}: positive({entry['positive']}) + neutral({entry['neutral']}) "
                f"+ negative({entry['negative']}) = {total}, expected {expected_per_date[date]}"
            )
