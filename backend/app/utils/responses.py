"""Standard API response helpers."""
from flask import jsonify


def ok(data=None, status=200):
    return jsonify(data or {}), status


def error(message: str, status=400, code=None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status
