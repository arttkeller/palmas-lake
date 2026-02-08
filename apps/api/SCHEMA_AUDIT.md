# Schema Usage Audit Report

## Summary

This document audits all Supabase queries in the application to ensure they use the correct schema (`palmaslake-agno`).

**Status**: ✅ PASSED - All queries use the correct schema

## Schema Configuration

The schema is configured in `services/supabase_client.py`:

```python
self.headers = {
    "Accept-Profile": "palmaslake-agno",   # Schema for reading
    "Content-Profile": "palmaslake-agno"   # Schema for writing
}
```

These headers are automatically included in all requests made through the `SupabaseREST` client.

## Audited Components

### Services

All services use `create_client()` which returns a `SupabaseREST` instance with correct schema headers:

1. ✅ **MessageService** (`services/message_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: leads, conversations, messages tables
   - Schema: Correctly configured via client headers

2. ✅ **SentimentService** (`services/sentiment_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: leads table
   - Schema: Correctly configured via client headers

3. ✅ **AnalyticsService** (`services/analytics_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: leads, conversations, messages tables
   - Schema: Correctly configured via client headers

4. ✅ **AnalyticsCacheService** (`services/analytics_cache_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: analytics_cache table
   - Schema: Correctly configured via client headers

5. ✅ **EventsQueryService** (`services/events_query_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: events table
   - Schema: Correctly configured via client headers

6. ✅ **FollowUpService** (`services/follow_up_service.py`)
   - Uses: `self.supabase = create_client()`
   - Queries: follow_ups, leads tables
   - Schema: Correctly configured via client headers

7. ✅ **AgentManager** (`services/agent_manager.py`)
   - Uses: `supabase = create_client()`
   - Queries: messages, leads tables
   - Schema: Correctly configured via client headers

8. ✅ **MariaTools** (`services/maria_tools.py`)
   - Uses: `supabase = create_client()`
   - Queries: leads, events tables
   - Schema: Correctly configured via client headers

9. ✅ **SofiaTools** (`services/sofia_tools.py`)
   - Uses: `supabase = create_client()`
   - Queries: leads, events tables
   - Schema: Correctly configured via client headers

### Routers

All routers use `create_client()` or services that use it:

1. ✅ **Leads Router** (`routers/leads.py`)
   - Uses: `get_db()` which returns `create_client()`
   - Queries: leads table
   - Schema: Correctly configured via client headers

2. ✅ **Chat Router** (`routers/chat.py`)
   - Uses: `MessageService` which uses `create_client()`
   - Queries: conversations, messages tables
   - Schema: Correctly configured via client headers

3. ✅ **Events Router** (`routers/events.py`)
   - Uses: `supabase = create_client()`
   - Queries: events table
   - Schema: Correctly configured via client headers

4. ✅ **Webhook Router** (`routers/webhook.py`)
   - Uses: `supabase = create_client()`
   - Queries: leads table
   - Schema: Correctly configured via client headers

## Error Handling

Schema-related error logging has been added to `SupabaseREST.execute()`:

```python
# Check for schema-related errors (Requirements 7.4)
if "schema" in res.text.lower() or "not found" in res.text.lower():
    schema_error = (
        f"[SCHEMA ERROR] Query failed - possibly due to schema mismatch. "
        f"Expected schema: palmaslake-agno. "
        f"Headers used: Accept-Profile={self.headers.get('Accept-Profile')}, "
        f"Content-Profile={self.headers.get('Content-Profile')}. "
        f"Error: {res.text}"
    )
    print(schema_error)
```

This ensures that any schema-related errors are clearly logged with context.

## Property-Based Tests

Property-based tests have been created to verify schema usage:

- ✅ **Property 17**: Schema usage in leads queries
- ✅ **Property 18**: Schema usage in conversations queries
- ✅ **Property 19**: Schema usage in messages queries

All tests pass with 100 iterations each.

## Recommendations

1. ✅ **Centralized Client**: All code uses `create_client()` - no direct instantiation of `SupabaseREST`
2. ✅ **Consistent Headers**: Schema headers are set once in the client constructor
3. ✅ **Error Logging**: Schema-related errors are now logged with clear context
4. ✅ **Testing**: Property-based tests verify schema usage across all table types

## Conclusion

All Supabase queries in the application correctly use the `palmaslake-agno` schema through the centralized `SupabaseREST` client. No changes to individual services or routers are needed.

**Requirements Validated**:
- ✅ 7.1: Leads queries use correct schema
- ✅ 7.2: Conversations queries use correct schema
- ✅ 7.3: Messages queries use correct schema
- ✅ 7.4: Schema errors are logged clearly
- ✅ 7.5: Client is configured with correct schema headers
