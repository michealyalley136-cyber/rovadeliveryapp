"""Add vendor management fields.

Revision ID: 010_vendor_management_fields
Revises: 009_order_status_pipeline
Create Date: 2026-02-20

"""
from alembic import op
import sqlalchemy as sa

revision = "010_vendor_management_fields"
down_revision = "009_order_status_pipeline"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("vendors") as batch:
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("phone", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("hours", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("delivery_radius_km", sa.Float(), nullable=True))
        batch.add_column(sa.Column("minimum_order_amount", sa.Float(), nullable=True))
        batch.add_column(sa.Column("prep_time_minutes", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("logo_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("banner_url", sa.String(length=500), nullable=True))


def downgrade():
    with op.batch_alter_table("vendors") as batch:
        batch.drop_column("banner_url")
        batch.drop_column("logo_url")
        batch.drop_column("prep_time_minutes")
        batch.drop_column("minimum_order_amount")
        batch.drop_column("delivery_radius_km")
        batch.drop_column("hours")
        batch.drop_column("phone")
        batch.drop_column("description")
