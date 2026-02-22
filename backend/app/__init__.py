"""ROVA Flask application factory."""
import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from .config import config_by_name
from .extensions import db, jwt, migrate
from .utils.responses import error


def create_app(config_name=None):
    config_name = config_name or os.getenv("FLASK_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    @jwt.unauthorized_loader
    def _jwt_unauthorized(_reason):
        return error("Authorization required", 401)

    @jwt.invalid_token_loader
    def _jwt_invalid(_reason):
        return error("Invalid token", 401)

    @jwt.expired_token_loader
    def _jwt_expired(_header, _payload):
        return error("Token has expired", 401)

    @jwt.needs_fresh_token_loader
    def _jwt_needs_fresh(_header, _payload):
        return error("Fresh token required", 401)

    @jwt.revoked_token_loader
    def _jwt_revoked(_header, _payload):
        return error("Token has been revoked", 401)

    env_name = os.getenv("FLASK_ENV") or os.getenv("ENV") or "development"
    is_dev = env_name == "development"
    dev_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ]
    api_origins = dev_origins if is_dev else dev_origins
    api_headers = ["Content-Type", "Authorization", "X-Admin-API-Key"]
    cors_resources = {
        r"/api/*": {
            "origins": api_origins,
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": api_headers,
        }
    }
    if is_dev:
        cors_resources[r"/health"] = {"origins": "*"}
    else:
        cors_resources[r"/health"] = {
            "origins": api_origins,
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": api_headers,
        }
    CORS(app, resources=cors_resources)

    from .routes import register_blueprints
    from .routes.public import public_bp
    register_blueprints(app)
    app.register_blueprint(public_bp, url_prefix="/api/public")

    @app.route("/health")
    def health():
        return {"status": "ok", "service": "rova-backend"}, 200

    @app.route("/")
    def root():
        return {
            "service": "rova-backend",
            "status": "ok",
            "health": "/health",
            "public_vendors": "/api/public/vendors",
        }, 200

    @app.route("/favicon.ico")
    def favicon():
        return ("", 204)

    @app.route("/uploads/<path:filename>")
    def uploads(filename):
        upload_folder = app.config.get("UPLOAD_FOLDER")
        if not upload_folder:
            return ("", 404)
        return send_from_directory(upload_folder, filename)

    return app
