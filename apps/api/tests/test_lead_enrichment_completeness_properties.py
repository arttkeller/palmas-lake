"""
Property-Based Tests for API Enrichment Field Completeness.

**Feature: fix-lead-enrichment-analytics, Property 1: API enrichment field completeness**
**Validates: Requirements 1.1, 1.3**

For any lead stored in the database with enrichment fields, when the Leads API
model serializes that lead, all enrichment fields should be present in the output
(as their value or null), and none should be silently dropped.
"""

import sys
import os
import json

import pytest
from hypothesis import given, settings, strategies as st, assume

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.leads import Lead

# =============================================================================
# Generators / Strategies
# =============================================================================

ENRICHMENT_FIELDS = [
    "sentiment_score", "sentiment_label", "interest_type",
    "temperature", "tags", "adjectives", "last_analysis",
]

tag_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_-"),
    min_size=1,
    max_size=20,
).filter(lambda s: s.strip() != "")

sentiment_label_st = st.sampled_from(["Positivo", "Neutro", "Negativo"])
interest_type_st = st.sampled_from(["apartamento", "sala_comercial", "office", "flat"])
temperature_st = st.sampled_from(["quente", "morno", "frio"])

lead_dict_st = st.fixed_dictionaries({
    "id": st.uuids().map(str),
    "full_name": st.text(min_size=1, max_size=50).filter(lambda s: s.strip() != ""),
    "phone": st.from_regex(r"\+55\d{10,11}", fullmatch=True),
    "email": st.none() | st.emails(),
    "status": st.sampled_from(["new", "contacted", "qualified", "em_atendimento"]),
    "notes": st.none() | st.text(max_size=100),
    "created_at": st.just("2025-01-01T00:00:00+00:00"),
    "sentiment_score": st.none() | st.integers(min_value=-100, max_value=100),
    "sentiment_label": st.none() | sentiment_label_st,
    "interest_type": st.none() | interest_type_st,
    "temperature": st.none() | temperature_st,
    "tags": st.none() | st.lists(tag_st, min_size=1, max_size=5),
    "adjectives": st.none() | st.lists(tag_st, min_size=1, max_size=5),
    "last_analysis": st.none() | st.fixed_dictionaries({
        "score": st.integers(min_value=-100, max_value=100),
        "label": sentiment_label_st,
    }),
})


# =============================================================================
# Property Tests
# =============================================================================

class TestLeadEnrichmentCompleteness:
    """
    **Feature: fix-lead-enrichment-analytics, Property 1: API enrichment field completeness**
    **Validates: Requirements 1.1, 1.3**
    """

    @settings(max_examples=100)
    @given(data=lead_dict_st)
    def test_enrichment_fields_preserved(self, data):
        """
        **Feature: fix-lead-enrichment-analytics, Property 1: API enrichment field completeness**
        **Validates: Requirements 1.1, 1.3**

        For any lead dict with enrichment fields, constructing a Lead model
        and dumping it should preserve all enrichment fields in the output.
        """
        lead = Lead(**data)
        output = lead.model_dump()

        for field in ENRICHMENT_FIELDS:
            assert field in output, (
                f"Enrichment field '{field}' missing from Lead model output"
            )
            assert output[field] == data[field], (
                f"Field '{field}' mismatch: expected {data[field]}, got {output[field]}"
            )
