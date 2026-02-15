"""DriverOffer table for dispatch offer window.

Revision ID: 003_driver_offers
Revises: 002_delivery_pricing
Create Date: 2025-02-14

"""
from alembic import op
import sqlalchemy as sa

revision = "003_driver_offers"
down_revision = "002_delivery_pricing"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "driver_offers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("offered_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_driver_offers_status", "driver_offers", ["status"], unique=False)
    op.create_index("ix_driver_offers_order_driver", "driver_offers", ["order_id", "driver_id"], unique=False)


def downgrade():
    op.drop_index("ix_driver_offers_order_driver", table_name="driver_offers")
    op.drop_index("ix_driver_offers_status", table_name="driver_offers")
    op.drop_table("driver_offers")
