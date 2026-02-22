"""JWT auth helpers for role-based access control."""
from functools import wraps

from flask import g, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

from .responses import error
from .jwt_errors import jwt_error_response


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return "", 200
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return jwt_error_response(exc)
        claims = get_jwt() or {}
        role = claims.get("role") or claims.get("type")
        g.user = {"id": get_jwt_identity(), "role": role, **claims}
        return fn(*args, **kwargs)

    return wrapper


def require_role(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return "", 200
            try:
                verify_jwt_in_request()
            except Exception as exc:
                return jwt_error_response(exc)
            claims = get_jwt() or {}
            role = claims.get("role") or claims.get("type")
            if role not in roles:
                return error("Forbidden", 403)
            g.user = {"id": get_jwt_identity(), "role": role, **claims}
            return fn(*args, **kwargs)

        return wrapper

    return decorator
