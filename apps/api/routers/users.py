
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from services.supabase_client import create_client

router = APIRouter()


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RoleUpdate(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# GET /api/users/me – return the current user's profile + role
# ---------------------------------------------------------------------------
@router.get("/users/me")
def get_current_user(x_user_id: str = Header(None, alias="x-user-id")):
    """
    Get the current user's CRM profile (including role).
    The frontend sends the Supabase auth user id in the x-user-id header.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing x-user-id header")

    sb = create_client()
    result = sb.table("users").select("*").eq("id", x_user_id).execute()

    if not result.data or len(result.data) == 0:
        # User exists in auth but not in CRM users table yet – return default
        return {
            "id": x_user_id,
            "email": "",
            "full_name": "",
            "role": "user",
            "created_at": None,
            "updated_at": None,
        }

    return result.data[0]


# ---------------------------------------------------------------------------
# GET /api/users – list all users (for admin user management panel)
# ---------------------------------------------------------------------------
@router.get("/users")
def list_users():
    """List all CRM users with their roles."""
    sb = create_client()
    result = sb.table("users").select("*").order("created_at", direction="asc").execute()

    if not result.data:
        return []

    return result.data


# ---------------------------------------------------------------------------
# PATCH /api/users/{user_id}/role – update a user's role
# ---------------------------------------------------------------------------
@router.patch("/users/{user_id}/role")
def update_user_role(user_id: str, body: RoleUpdate):
    """Update a user's role (admin or user)."""
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    sb = create_client()
    result = sb.table("users").update({"role": body.role}).eq("id", user_id).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return result.data[0]


# ---------------------------------------------------------------------------
# PATCH /api/users/{user_id} – update user profile (name)
# ---------------------------------------------------------------------------
@router.patch("/users/{user_id}")
def update_user_profile(user_id: str, body: dict):
    """Update a user's profile fields (full_name, etc.)."""
    allowed_fields = {"full_name"}
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    sb = create_client()
    result = sb.table("users").update(update_data).eq("id", user_id).execute()

    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return result.data[0]


# ---------------------------------------------------------------------------
# DELETE /api/users/{user_id} – remove a user
# ---------------------------------------------------------------------------
@router.delete("/users/{user_id}")
def delete_user(user_id: str):
    """Delete a CRM user. The auth.users row is NOT deleted (Supabase manages that)."""
    sb = create_client()
    result = sb.table("users").delete().eq("id", user_id).execute()
    return {"deleted": True}
