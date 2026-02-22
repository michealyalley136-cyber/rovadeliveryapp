"""JWT error normalization helpers."""
from __future__ import annotations

from flask_jwt_extended.exceptions import (
    CSRFError,
    FreshTokenRequired,
    InvalidHeaderError,
    JWTDecodeError,
    NoAuthorizationError,
    RevokedTokenError,
    WrongTokenError,
)
from jwt import ExpiredSignatureError

from .responses import error


def jwt_error_response(exc: Exception):
    if isinstance(exc, ExpiredSignatureError):
        return error("Token has expired", 401)
    if isinstance(exc, FreshTokenRequired):
        return error("Fresh token required", 401)
    if isinstance(exc, RevokedTokenError):
        return error("Token has been revoked", 401)
    if isinstance(exc, (NoAuthorizationError, InvalidHeaderError, JWTDecodeError, CSRFError, WrongTokenError)):
        return error("Authorization required", 401)
    return error("Invalid token", 401)
