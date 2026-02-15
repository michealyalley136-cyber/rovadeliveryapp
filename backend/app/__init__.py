"""ROVA Flask application factory."""
import os
from flask import Flask
from flask_cors import CORS
from .config import config_by_name
from .extensions import db, jwt, migrate


def create_app(config_name=None):
    config_name = config_name or os.getenv("FLASK_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ]
    cors_options = {
        "origins": cors_origins,
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Admin-API-Key"],
    }
    CORS(app, resources={r"/api/*": cors_options, r"/health": cors_options})

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

    return app
