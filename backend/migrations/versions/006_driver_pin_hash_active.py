"""Add driver_pin_hash and driver_is_active columns.

Revision ID: 006_driver_pin_hash_active
Revises: 005_vendor_pin_hash_active
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "006_driver_pin_hash_active"
down_revision = "005_vendor_pin_hash_active"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("drivers")}
    if "driver_pin_hash" not in existing:
        op.add_column("drivers", sa.Column("driver_pin_hash", sa.String(length=255), nullable=True))
    if "driver_is_active" not in existing:
        op.add_column(
            "drivers",
            sa.Column("driver_is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("drivers")}
    if "driver_is_active" in existing:
        op.drop_column("drivers", "driver_is_active")
    if "driver_pin_hash" in existing:
        op.drop_column("drivers", "driver_pin_hash")
