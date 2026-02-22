"""Add driver location fields to orders.

Revision ID: 012_driver_location
Revises: 011_driver_status
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "012_driver_location"
down_revision = "011_driver_status"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("driver_lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("driver_lng", sa.Float(), nullable=True))
        batch.add_column(sa.Column("driver_location_updated_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("driver_location_updated_at")
        batch.drop_column("driver_lng")
        batch.drop_column("driver_lat")
