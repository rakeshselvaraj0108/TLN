import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.hash import scrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.core.config import get_settings
from app.models import User, Session, UserRole

settings = get_settings()
security = HTTPBearer(auto_error=False)


def _scrypt_rounds() -> int:
    """passlib expresses scrypt's cost as log2(N); SCRYPT_N holds N itself."""
    n = settings.SCRYPT_N
    rounds = n.bit_length() - 1
    if 1 << rounds != n:
        raise ValueError(f"SCRYPT_N must be a power of two, got {n}")
    return rounds


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    hash_value = scrypt.using(
        rounds=_scrypt_rounds(),
        block_size=settings.SCRYPT_R,
        parallelism=settings.SCRYPT_P,
        salt=bytes.fromhex(salt)
    ).hash(password)
    return hash_value, salt


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return scrypt.verify(password, password_hash)
    except Exception:
        return False


def get_password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:32]


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User inactive")

    session_result = await db.execute(
        select(Session).where(
            Session.user_id == user.id,
            Session.token == credentials.credentials,
            Session.revoked_at.is_(None),
            Session.expires_at > datetime.utcnow(),
            Session.password_hash_fingerprint == get_password_fingerprint(user.password_hash)
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    return user


async def require_supervisor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SUPERVISOR:
        raise HTTPException(status_code=403, detail="Supervisor role required")
    return current_user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None