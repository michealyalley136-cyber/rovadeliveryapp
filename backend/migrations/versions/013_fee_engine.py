"""Add fee engine fields for service fees and vendor overrides.

Revision ID: 013_fee_engine
Revises: 012_driver_location
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "013_fee_engine"
down_revision = "012_driver_location"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("delivery_pricing_config") as batch:
        batch.add_column(sa.Column("service_fee_percent", sa.Numeric(5, 2), nullable=False, server_default="0"))
        batch.add_column(sa.Column("minimum_service_fee_ghs", sa.Numeric(10, 2), nullable=False, server_default="0"))

    with op.batch_alter_table("vendors") as batch:
        batch.add_column(sa.Column("base_delivery_fee_ghs", sa.Float(), nullable=True))
        batch.add_column(sa.Column("per_km_fee_ghs", sa.Float(), nullable=True))
        batch.add_column(sa.Column("service_fee_percent", sa.Float(), nullable=True))
        batch.add_column(sa.Column("minimum_service_fee_ghs", sa.Float(), nullable=True))

    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("service_fee_cents", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("service_fee_ghs", sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("service_fee_ghs")
        batch.drop_column("service_fee_cents")

    with op.batch_alter_table("vendors") as batch:
        batch.drop_column("minimum_service_fee_ghs")
        batch.drop_column("service_fee_percent")
        batch.drop_column("per_km_fee_ghs")
        batch.drop_column("base_delivery_fee_ghs")

    with op.batch_alter_table("delivery_pricing_config") as batch:
        batch.drop_column("minimum_service_fee_ghs")
        batch.drop_column("service_fee_percent")
