import secrets
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings


bearer_scheme = HTTPBearer(auto_error=False, description="网页、AI 与 API 客户端使用同一个 Bearer Token")


def require_bearer(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)):
    if not credentials or not secrets.compare_digest(credentials.credentials, settings.api_token):
        raise HTTPException(
            status_code=401,
            detail="需要有效的 Bearer Token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True
