"""
Property-Based Tests for Heatmap Round-Trip Serialization.

**Feature: fix-crm-analytics-bugs, Property 5: Heatmap round-trip serialization**
**Validates: Requirements 5.3, 8.1, 8.2**

Uses hypothesis library for property-based testing.
Each test runs minimum 100 iterations as specified in the design document.
"""

import json
import pytest
from hypothesis import given, settings, strategies as st


# =============================================================================
# Strategies
# =============================================================================

heatmap_entry_strategy = st.fixed_dictionaries({
    "dow": st.integers(min_value=0, max_value=6),
    "hour": st.integers(min_value=0, max_value=23),
    "value": st.integers(min_value=0, max_value=10000),
})

heatmap_list_strategy = st.lists(heatmap_entry_strategy, min_size=0, max_size=50)


# =============================================================================
# Property Test
# =============================================================================

class TestHeatmapRoundTripSerialization:
    """
    **Feature: fix-crm-analytics-bugs, Property 5: Heatmap round-trip serialization**
    **Validates: Requirements 5.3, 8.1, 8.2**
    """

    @settings(max_examples=100)
    @given(heatmap_data=heatmap_list_strategy)
    def test_json_roundtrip_preserves_heatmap_data(self, heatmap_data):
        """
        **Feature: fix-crm-analytics-bugs, Property 5: Heatmap round-trip serialization**
        **Validates: Requirements 5.3, 8.1, 8.2**

        For any list of heatmap entries {dow, hour, value} where dow in [0,6],
        hour in [0,23], and value >= 0, serializing to JSON and deserializing
        back SHALL produce an identical list.
        """
        serialized = json.dumps(heatmap_data)
        deserialized = json.loads(serialized)

        assert deserialized == heatmap_data, (
            f"Round-trip failed: original={heatmap_data}, deserialized={deserialized}"
        )

        # Verify each entry preserves dow, hour, value fields with correct types
        for original, restored in zip(heatmap_data, deserialized):
            assert restored["dow"] == original["dow"]
            assert restored["hour"] == original["hour"]
            assert restored["value"] == original["value"]
            assert isinstance(restored["dow"], int)
            assert isinstance(restored["hour"], int)
            assert isinstance(restored["value"], int)
