"""
Property-based test for schema header configuration.

Feature: fix-chat-messages-loading, Property 4: Schema header is set to palmaslake-agno
Validates: Requirements 3.4
"""

import sys
import os
from hypothesis import given, strategies as st, settings
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.supabase_client import create_client, SupabaseREST

# Strategy: generate arbitrary table names to verify headers propagate for any table
table_names = st.sampled_from(["messages", "conversations", "leads"])


# Feature: fix-chat-messages-loading, Property 4: Schema header is set to palmaslake-agno
@given(table_name=table_names)
@settings(max_examples=100)
def test_schema_header_is_palmaslake_agno(table_name):
    """
    Property 4: Schema header is set to palmaslake-agno

    *For any* SupabaseREST client instance, the Accept-Profile and
    Content-Profile headers should both be set to 'palmaslake-agno'.
    This must hold for queries against any table (messages, conversations, leads).

    Validates: Requirements 3.4
    """
    client = create_client()

    # Client-level headers
    assert client.headers["Accept-Profile"] == "palmaslake-agno"
    assert client.headers["Content-Profile"] == "palmaslake-agno"

    # QueryBuilder inherits the same headers
    qb = client.table(table_name)
    assert qb.headers["Accept-Profile"] == "palmaslake-agno"
    assert qb.headers["Content-Profile"] == "palmaslake-agno"

    # Headers actually reach the HTTP layer
    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = []
        mock_get.return_value = mock_resp

        qb.select("*").execute()

        assert mock_get.called
        headers_sent = mock_get.call_args.kwargs.get("headers", {})
        assert headers_sent.get("Accept-Profile") == "palmaslake-agno"
        assert headers_sent.get("Content-Profile") == "palmaslake-agno"
