"""Application configuration."""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = 3600 * 24  # 24h
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER") or os.path.join(BASE_DIR, "uploads")
    ALLOW_DEV_ID_FALLBACK = (
        os.getenv("ALLOW_DEV_ID_FALLBACK", "") == "1"
        or os.getenv("FLASK_ENV", "") == "development"
    )


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "postgresql://rova:rova@localhost:5432/rova"
    )
    ALLOW_DEV_ID_FALLBACK = True


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL", "sqlite:///:memory:"
    )
    JWT_SECRET_KEY = "test-jwt-secret"
    ALLOW_DEV_ID_FALLBACK = False


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    ALLOW_DEV_ID_FALLBACK = os.getenv("ALLOW_DEV_ID_FALLBACK", "") == "1"


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}
