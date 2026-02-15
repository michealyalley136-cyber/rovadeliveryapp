"""Customer register/login."""
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from ..extensions import db
from ..models import User
from ..utils.auth import hash_password, check_password
from ..utils.responses import ok, error
from ..utils.validators import validate_email, validate_required

auth_customer_bp = Blueprint("auth_customer", __name__)


def _user_to_json(u):
    return {"id": u.id, "email": u.email, "full_name": u.full_name}


@auth_customer_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    missing = validate_required(data, ["email", "password"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    if not validate_email(data["email"]):
        return error("Invalid email", 400)
    if len(data["password"]) < 6:
        return error("Password must be at least 6 characters", 400)
    if User.query.filter_by(email=data["email"].strip().lower()).first():
        return error("Email already registered", 409)
    user = User(
        email=data["email"].strip().lower(),
        password_hash=hash_password(data["password"]),
        full_name=(data.get("full_name") or "").strip() or None,
    )
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id), additional_claims={"type": "customer"})
    return ok({"user": _user_to_json(user), "access_token": token}, 201)


@auth_customer_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    missing = validate_required(data, ["email", "password"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    user = User.query.filter_by(email=data["email"].strip().lower()).first()
    if not user or not check_password(data["password"], user.password_hash):
        return error("Invalid email or password", 401)
    token = create_access_token(identity=str(user.id), additional_claims={"type": "customer"})
    return ok({"user": _user_to_json(user), "access_token": token})


@auth_customer_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    uid = int(get_jwt_identity())
    user = User.query.get(uid)
    if not user:
        return error("User not found", 404)
    return ok(_user_to_json(user))
