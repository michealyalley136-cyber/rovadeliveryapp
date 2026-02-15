"""Add vendor pin_hash column.

Revision ID: 004_vendor_pin
Revises: 003_driver_offers
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa

revision = "004_vendor_pin"
down_revision = "003_driver_offers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("vendors", sa.Column("pin_hash", sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column("vendors", "pin_hash")
