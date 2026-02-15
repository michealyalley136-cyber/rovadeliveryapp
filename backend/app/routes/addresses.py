"""Customer addresses CRUD."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models import Address
from ..utils.responses import ok, error
from ..utils.validators import validate_required, validate_positive_int

addresses_bp = Blueprint("addresses", __name__)


def _address_to_json(a):
    return {
        "id": a.id,
        "label": a.label,
        "address_text": a.address_text,
        "lat": a.lat,
        "lng": a.lng,
    }


@addresses_bp.route("", methods=["GET"])
@jwt_required()
def list_addresses():
    uid = int(get_jwt_identity())
    addrs = Address.query.filter_by(user_id=uid).all()
    return ok({"addresses": [_address_to_json(a) for a in addrs]})


@addresses_bp.route("", methods=["POST"])
@jwt_required()
def create_address():
    uid = int(get_jwt_identity())
    data = request.get_json() or {}
    missing = validate_required(data, ["address_text"])
    if missing:
        return error(f"Missing: {', '.join(missing)}", 400)
    lat, lng = data.get("lat"), data.get("lng")
    if lat is not None:
        err, _ = validate_positive_int(lat, "lat")
        if err:
            return error(err, 400)
    if lng is not None:
        err, _ = validate_positive_int(lng, "lng")
        if err:
            return error(err, 400)
    addr = Address(
        user_id=uid,
        label=(data.get("label") or "").strip() or None,
        address_text=data["address_text"].strip(),
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
    )
    db.session.add(addr)
    db.session.commit()
    return ok(_address_to_json(addr), 201)


@addresses_bp.route("/<int:address_id>", methods=["GET"])
@jwt_required()
def get_address(address_id):
    uid = int(get_jwt_identity())
    addr = Address.query.filter_by(id=address_id, user_id=uid).first()
    if not addr:
        return error("Address not found", 404)
    return ok(_address_to_json(addr))


@addresses_bp.route("/<int:address_id>", methods=["PUT"])
@jwt_required()
def update_address(address_id):
    uid = int(get_jwt_identity())
    addr = Address.query.filter_by(id=address_id, user_id=uid).first()
    if not addr:
        return error("Address not found", 404)
    data = request.get_json() or {}
    if "address_text" in data:
        addr.address_text = data["address_text"].strip()
    if "label" in data:
        addr.label = (data["label"] or "").strip() or None
    if "lat" in data:
        addr.lat = float(data["lat"]) if data["lat"] is not None else None
    if "lng" in data:
        addr.lng = float(data["lng"]) if data["lng"] is not None else None
    db.session.commit()
    return ok(_address_to_json(addr))


@addresses_bp.route("/<int:address_id>", methods=["DELETE"])
@jwt_required()
def delete_address(address_id):
    uid = int(get_jwt_identity())
    addr = Address.query.filter_by(id=address_id, user_id=uid).first()
    if not addr:
        return error("Address not found", 404)
    db.session.delete(addr)
    db.session.commit()
    return ok({}, 204)
