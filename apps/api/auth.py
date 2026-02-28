"""
JWT Authentication for FastAPI using Supabase tokens.

The frontend sends `Authorization: Bearer <supabase_access_token>`.
This module verifies the token using SUPABASE_JWT_SECRET and extracts
the user ID (`sub` claim).

Usage in main.py:
    from auth import verify_jwt
    app.include_router(router, dependencies=[Depends(verify_jwt)])
"""

import os
import logging

import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


async def verify_jwt(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    FastAPI dependency that validates a Supabase JWT.

    Returns the decoded payload (contains `sub`, `email`, `role`, etc.).
    Raises 401 if missing, expired, or invalid.
    """
    if not SUPABASE_JWT_SECRET:
        logger.warning("[Auth] SUPABASE_JWT_SECRET not configured — skipping JWT verification")
        return {}

    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"[Auth] Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
