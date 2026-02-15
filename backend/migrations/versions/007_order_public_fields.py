"""Add order public fields and items snapshot.

Revision ID: 007_order_public_fields
Revises: 006_driver_pin_hash_active
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "007_order_public_fields"
down_revision = "006_driver_pin_hash_active"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("orders")}
    if "customer_name" not in existing:
        op.add_column("orders", sa.Column("customer_name", sa.String(length=255), nullable=True))
    if "customer_phone" not in existing:
        op.add_column("orders", sa.Column("customer_phone", sa.String(length=50), nullable=True))
    if "order_public_token" not in existing:
        op.add_column("orders", sa.Column("order_public_token", sa.String(length=64), nullable=True))
    if "items_snapshot" not in existing:
        op.add_column("orders", sa.Column("items_snapshot", sa.Text(), nullable=True))
    try:
        op.create_index("ix_orders_public_token", "orders", ["order_public_token"])
    except Exception:
        pass


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing = {col["name"] for col in inspector.get_columns("orders")}
    if "items_snapshot" in existing:
        op.drop_column("orders", "items_snapshot")
    if "order_public_token" in existing:
        op.drop_column("orders", "order_public_token")
    if "customer_phone" in existing:
        op.drop_column("orders", "customer_phone")
    if "customer_name" in existing:
        op.drop_column("orders", "customer_name")
    try:
        op.drop_index("ix_orders_public_token", table_name="orders")
    except Exception:
        pass
