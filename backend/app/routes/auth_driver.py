"""Driver register/login."""
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from ..extensions import db
from ..models import Driver
from ..utils.auth import hash_password, check_password
from ..utils.responses import ok, error
from ..utils.validators import validate_email, validate_required


auth_driver_bp = Blueprint("auth_driver", __name__)


def _driver_to_json(d):
    return {
        "id": d.id,
        "email": d.email,
        "full_name": d.full_name,
        "is_online": d.is_online,
        "approved": d.approved,
    }


@auth_driver_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    missing = validate_required(data, ["email", "password"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    if not validate_email(data["email"]):
        return error("Invalid email", 400)
    if len(data["password"]) < 6:
        return error("Password must be at least 6 characters", 400)
    if Driver.query.filter_by(email=data["email"].strip().lower()).first():
        return error("Email already registered", 409)
    driver = Driver(
        email=data["email"].strip().lower(),
        password_hash=hash_password(data["password"]),
        full_name=(data.get("full_name") or "").strip() or None,
        phone=(data.get("phone") or "").strip() or None,
    )
    db.session.add(driver)
    db.session.commit()
    token = create_access_token(
        identity=str(driver.id),
        additional_claims={"type": "driver", "role": "driver", "driver_id": driver.id},
    )
    return ok({"driver": _driver_to_json(driver), "access_token": token}, 201)


@auth_driver_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    missing = validate_required(data, ["email", "password"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    driver = Driver.query.filter_by(email=data["email"].strip().lower()).first()
    if not driver or not check_password(data["password"], driver.password_hash):
        return error("Invalid email or password", 401)
    token = create_access_token(
        identity=str(driver.id),
        additional_claims={"type": "driver", "role": "driver", "driver_id": driver.id},
    )
    return ok({"driver": _driver_to_json(driver), "access_token": token})


@auth_driver_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    did = int(get_jwt_identity())
    driver = Driver.query.get(did)
    if not driver:
        return error("Driver not found", 404)
    return ok(_driver_to_json(driver))
