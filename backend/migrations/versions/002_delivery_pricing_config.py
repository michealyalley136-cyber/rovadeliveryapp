"""DeliveryPricingConfig table and Order GHS/distance columns.

Revision ID: 002_delivery_pricing
Revises: 001_initial
Create Date: 2025-02-14

"""
from alembic import op
import sqlalchemy as sa

revision = "002_delivery_pricing"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "delivery_pricing_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("base_km", sa.Float(), nullable=False, server_default=sa.text("3.0")),
        sa.Column("base_fee_ghs", sa.Numeric(10, 2), nullable=False, server_default=sa.text("12")),
        sa.Column("per_km_fee_ghs", sa.Numeric(10, 2), nullable=False, server_default=sa.text("2")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    # Default row is created by seed script

    op.add_column("orders", sa.Column("delivery_distance_km", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("delivery_fee_ghs", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("subtotal_ghs", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("total_ghs", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("orders", "total_ghs")
    op.drop_column("orders", "subtotal_ghs")
    op.drop_column("orders", "delivery_fee_ghs")
    op.drop_column("orders", "delivery_distance_km")
    op.drop_table("delivery_pricing_config")
