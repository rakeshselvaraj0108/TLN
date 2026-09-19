"""Routes tagged "auth"."""
from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from tracex_api import audit
from tracex_api.auth import PASSWORDS, USERS, User, current_user, issue_token, require_supervisor

router = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    username: str
    password: str


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@router.post("/auth/login", summary="Login")
def login(body: LoginIn):
    """Exchange a username and password for a signed session token.

    Failure is reported identically whether the account does not exist, has no
    password set, or the password is wrong.
    """
    stored = PASSWORDS.get(body.username)
    if body.username not in USERS or not stored or not hmac.compare_digest(stored, _hash(body.password)):
        audit.record(body.username or "anonymous", "auth.login.failed", "user", body.username)
        raise HTTPException(status_code=401, detail="invalid username or password")
    audit.record(body.username, "auth.login", "user", body.username)
    info = USERS[body.username]
    return {"token": issue_token(body.username), "token_type": "bearer", "user": {"username": body.username, **info}}


@router.post("/auth/password", summary="Set Password")
def set_password(body: PasswordIn, user: User = Depends(current_user)):
    """Set or reset an account password. Supervisor only. Invalidates earlier tokens."""
    require_supervisor(user, "setting passwords requires the supervisor role")
    if body.username not in USERS:
        raise HTTPException(status_code=404, detail=f"unknown user '{body.username}'")
    if len(body.password) < 12:
        raise HTTPException(status_code=422, detail="password must be at least 12 characters")
    PASSWORDS[body.username] = _hash(body.password)
    audit.record(user.username, "auth.password.set", "user", body.username)
    return {"username": body.username, "updated": True}


@router.get("/auth/posture", summary="Posture")
def posture():
    """Configuration faults that matter once the data is real."""
    problems = []
    import os
    if os.environ.get("TRACEX_SECRET") is None:
        problems.append("TRACEX_SECRET is not set; session tokens use the demo signing key")
    return {"demo_mode": True, "auth_mode": "trusted_header", "rate_limit_enabled": False, "problems": problems}


@router.get("/auth/me", summary="Me")
def me(user: User = Depends(current_user)):
    return user.public()


@router.get("/auth/users", summary="Users")
def users():
    """Provisioned accounts, so the demo UI can offer a role switcher."""
    return {"users": [{"username": name, **info} for name, info in USERS.items()]}
