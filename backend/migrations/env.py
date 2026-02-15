"""Alembic env.py - use Flask app and SQLAlchemy."""
from logging.config import fileConfig
import os
import sys

from alembic import context
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import op
import flask_migrate

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Use Flask app for config and model metadata
from app import create_app
from app.extensions import db
import app.models  # noqa: F401 - register all models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = db.metadata


def get_url():
    from app.config import config_by_name
    import os
    env = os.getenv("FLASK_ENV", "development")
    return config_by_name[env].SQLALCHEMY_DATABASE_URI


def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
