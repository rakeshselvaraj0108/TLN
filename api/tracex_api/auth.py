"""Caller identity.

Demo deployments run in `trusted_header` mode: the caller names a provisioned user with
`Authorization: Bearer <username>` or `X-Tracex-User: <username>` (the web client's role switcher
does exactly that). `/auth/login` issues a signed token that is accepted in the same header.
Links opened outside fetch (CSV/PDF exports) carry `?as_user=`.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Query

SECRET = os.environ.get("TRACEX_SECRET", "tracex-demo-secret").encode()
TOKEN_TTL_S = 8 * 3600

USERS = {
    "investigator": {"display_name": "Demo Investigator", "role": "investigator"},
    "supervisor": {"display_name": "Demo Supervisor", "role": "supervisor"},
}
PASSWORDS: dict[str, str] = {}  # username -> sha256 hex, set via /auth/password


@dataclass(frozen=True)
class User:
    username: str
    display_name: str
    role: str

    @property
    def is_supervisor(self) -> bool:
        return self.role == "supervisor"

    def public(self) -> dict:
        return {"username": self.username, "display_name": self.display_name, "role": self.role, "is_supervisor": self.is_supervisor}


def _fingerprint(username: str) -> str:
    return hashlib.sha256((PASSWORDS.get(username, "") + username).encode()).hexdigest()[:16]


def issue_token(username: str) -> str:
    claims = {"sub": username, "exp": int(time.time()) + TOKEN_TTL_S, "fp": _fingerprint(username)}
    payload = base64.urlsafe_b64encode(json.dumps(claims, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _username_from_token(token: str) -> str:
    if "." not in token:
        return token  # trusted-header demo mode: the bearer value is the username
    payload, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()):
        raise HTTPException(status_code=401, detail="invalid session token")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if claims["exp"] < time.time():
        raise HTTPException(status_code=401, detail="session token expired")
    if claims.get("fp") != _fingerprint(claims["sub"]):
        raise HTTPException(status_code=401, detail="session token revoked")
    return claims["sub"]


def resolve_user(username: str | None) -> User:
    if not username:
        raise HTTPException(status_code=401, detail="missing credentials: send 'Authorization: Bearer <token>'")
    info = USERS.get(username)
    if not info:
        raise HTTPException(status_code=401, detail=f"unknown user '{username}'")
    return User(username=username, **info)


def current_user(
    authorization: str | None = Header(None),
    x_tracex_user: str | None = Header(None),
) -> User:
    if x_tracex_user:
        return resolve_user(x_tracex_user)
    if authorization and authorization.lower().startswith("bearer "):
        return resolve_user(_username_from_token(authorization.split(" ", 1)[1].strip()))
    return resolve_user(None)


def export_user(
    as_user: str | None = Query(None),
    authorization: str | None = Header(None),
    x_tracex_user: str | None = Header(None),
) -> User:
    """Exports are opened as plain links, so they may name the user in the query string."""
    if as_user:
        return resolve_user(as_user)
    return current_user(authorization, x_tracex_user)


def require_supervisor(user: User, detail: str = "exporting an evidence package requires the supervisor role") -> None:
    if not user.is_supervisor:
        raise HTTPException(status_code=403, detail=detail)
