"""Add driver_status to orders.

Revision ID: 011_driver_status
Revises: 010_vendor_management_fields
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "011_driver_status"
down_revision = "010_vendor_management_fields"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("driver_status", sa.String(length=30), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("driver_status")
