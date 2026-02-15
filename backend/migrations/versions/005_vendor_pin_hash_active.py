"""Add vendor_pin_hash and vendor_is_active columns.

Revision ID: 005_vendor_pin_hash_active
Revises: 004_vendor_pin
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "005_vendor_pin_hash_active"
down_revision = "004_vendor_pin"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("vendors")}
    if "vendor_pin_hash" not in existing:
        op.add_column("vendors", sa.Column("vendor_pin_hash", sa.String(length=255), nullable=True))
    if "vendor_is_active" not in existing:
        op.add_column(
            "vendors",
            sa.Column("vendor_is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("vendors")}
    if "vendor_is_active" in existing:
        op.drop_column("vendors", "vendor_is_active")
    if "vendor_pin_hash" in existing:
        op.drop_column("vendors", "vendor_pin_hash")
