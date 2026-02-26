
import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

class SupabaseREST:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "")
        self.key = os.environ.get("SUPABASE_KEY", "")
        # Schema headers are required for all queries (Requirements 7.1, 7.2, 7.3, 7.5)
        # Accept-Profile: specifies which schema to use for reading data
        # Content-Profile: specifies which schema to use for writing data
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "Accept-Profile": "palmaslake-agno",  # Schema for reading (Requirements 7.1, 7.2, 7.3)
            "Content-Profile": "palmaslake-agno"  # Schema for writing (Requirements 7.5)
        }

    def table(self, table_name: str):
        return QueryBuilder(self.url, self.headers, table_name)

    def rpc(self, function_name: str, params: dict = None):
        """Call a PostgreSQL function via PostgREST RPC."""
        return RPCBuilder(self.url, self.headers, function_name, params or {})

class QueryBuilder:
    def __init__(self, url, headers, table):
        self.url = f"{url.rstrip('/')}/rest/v1/{table}"
        self.headers = headers
        self.params = {}

    def select(self, columns="*"):
        self.params["select"] = columns
        return self

    def insert(self, data):
        self.method = "POST"
        self.data = data
        return self

    def update(self, data):
        self.method = "PATCH"
        self.data = data
        return self

    def delete(self):
        self.method = "DELETE"
        return self
    
    def eq(self, column, value):
        # PostgREST syntax: column=eq.value
        self.params[column] = f"eq.{value}"
        return self

    def neq(self, column, value):
        # PostgREST syntax: column=neq.value
        self.params[column] = f"neq.{value}"
        return self

    def gte(self, column, value):
        # PostgREST syntax: column=gte.value
        self.params[column] = f"gte.{value}"
        return self

    def lte(self, column, value):
        # PostgREST syntax: column=lte.value
        self.params[column] = f"lte.{value}"
        return self

    def gt(self, column, value):
        # PostgREST syntax: column=gt.value
        self.params[column] = f"gt.{value}"
        return self

    def lt(self, column, value):
        # PostgREST syntax: column=lt.value
        self.params[column] = f"lt.{value}"
        return self

    def ilike(self, column, value):
        # PostgREST syntax: column=ilike.value (case-insensitive LIKE)
        self.params[column] = f"ilike.{value}"
        return self

    def in_(self, column, values):
        # PostgREST syntax: column=in.(value1,value2,value3)
        values_str = ",".join(str(v) for v in values)
        self.params[column] = f"in.({values_str})"
        return self

    def or_(self, filters: str):
        # PostgREST syntax: or=(filter1,filter2)
        self.params["or"] = f"({filters})"
        return self

    def order(self, column, direction="asc"):
        # PostgREST syntax: order=column.asc
        self.params["order"] = f"{column}.{direction}"
        return self

    def limit(self, count: int):
        self.params["limit"] = count
        return self

    def range(self, start: int, end: int):
        self.params["offset"] = start
        # PostgREST range is inclusive start, but limit is count. 
        # range(0, 4) in supabase usually means first 5 items. 
        # Here we just set limit to (end - start + 1)
        self.params["limit"] = end - start + 1
        return self

    def execute(self):
        try:
            method = getattr(self, 'method', 'GET')
            
            if method == 'GET':
                res = requests.get(self.url, headers=self.headers, params=self.params, timeout=15)
            elif method == 'POST':
                res = requests.post(self.url, headers=self.headers, json=self.data, params=self.params, timeout=15)
            elif method == 'PATCH':
                res = requests.patch(self.url, headers=self.headers, json=self.data, params=self.params, timeout=15)
            elif method == 'DELETE':
                res = requests.delete(self.url, headers=self.headers, params=self.params, timeout=15)
            else:
                res = requests.get(self.url, headers=self.headers, params=self.params, timeout=15)
            
            # Mimic supabase-py response structure
            class Response:
                def __init__(self, data):
                    self.data = data
            
            if res.status_code >= 400:
                error_msg = f"Supabase Error {res.status_code}: {res.text}"
                print(error_msg)
                
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
                
                return Response(None)
            
            # DELETE pode retornar vazio
            if res.status_code == 204 or not res.text:
                return Response([])
                
            return Response(res.json())
        except Exception as e:
             error_msg = f"Supabase Request Error: {e}"
             print(error_msg)
             
             # Log if this might be a schema-related error (Requirements 7.4)
             if "schema" in str(e).lower():
                 schema_error = (
                     f"[SCHEMA ERROR] Request failed with possible schema issue. "
                     f"Expected schema: palmaslake-agno. "
                     f"Headers: Accept-Profile={self.headers.get('Accept-Profile')}, "
                     f"Content-Profile={self.headers.get('Content-Profile')}. "
                     f"Error: {e}"
                 )
                 print(schema_error)
             
             class Response:
                 def __init__(self, data):
                     self.data = data
             return Response(None)

class RPCBuilder:
    """Calls a PostgreSQL function via PostgREST RPC (POST /rest/v1/rpc/<fn>)."""

    def __init__(self, base_url, headers, function_name, params):
        self.url = f"{base_url.rstrip('/')}/rest/v1/rpc/{function_name}"
        self.headers = headers
        self.params = params

    def execute(self):
        try:
            res = requests.post(
                self.url, headers=self.headers, json=self.params, timeout=15
            )

            class Response:
                def __init__(self, data):
                    self.data = data

            if res.status_code >= 400:
                print(f"[RPC] Error {res.status_code}: {res.text}")
                return Response(None)

            if res.status_code == 204 or not res.text:
                return Response(None)

            return Response(res.json())
        except Exception as e:
            print(f"[RPC] Request error: {e}")

            class Response:
                def __init__(self, data):
                    self.data = data
            return Response(None)


def create_client():
    return SupabaseREST()
