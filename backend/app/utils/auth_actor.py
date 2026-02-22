"""Helpers for resolving actor identity with optional dev fallback."""
from __future__ import annotations

from flask import request, current_app
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from .responses import error
from .jwt_errors import jwt_error_response


def require_role_claim(expected_role: str):
    claims = get_jwt() or {}
    role = claims.get("role") or claims.get("type")
    if role != expected_role:
        return None, error("Forbidden", 403)
    return role, None


def _coerce_identity_to_int(identity):
    if isinstance(identity, dict) and "id" in identity:
        identity = identity["id"]
    return int(identity)


def get_actor_id_or_401(actor_key: str, *, allow_fallback: bool | None = None, expected_role: str | None = None):
    """
    actor_key: 'driver_id' or 'vendor_id'
    Priority:
      - If Authorization header present -> JWT identity required
      - Else if allow_fallback -> pull from JSON
      - Else -> 401
    """
    allow_fallback = (
        current_app.config.get("ALLOW_DEV_ID_FALLBACK", False)
        if allow_fallback is None
        else allow_fallback
    )
    auth_header = request.headers.get("Authorization")
    if auth_header:
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return None, jwt_error_response(exc)
        if expected_role:
            _, err = require_role_claim(expected_role)
            if err:
                return None, err
        claims = get_jwt() or {}
        identity = claims.get(actor_key) or get_jwt_identity()
        try:
            return _coerce_identity_to_int(identity), None
        except (TypeError, ValueError):
            return None, error("Invalid token", 403)

    if not allow_fallback:
        return None, error("Authorization required", 401)

    data = request.get_json(silent=True) or {}
    if actor_key not in data:
        return None, error("Authorization required", 401)
    try:
        return int(data[actor_key]), None
    except (TypeError, ValueError):
        return None, error(f"{actor_key} must be an integer", 400)
