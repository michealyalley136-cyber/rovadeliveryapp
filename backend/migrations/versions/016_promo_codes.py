"""Promo codes and order discounts.

Revision ID: 016_promo_codes
Revises: 015_admin_order_monitor
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "016_promo_codes"
down_revision = "015_admin_order_monitor"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=True)

    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("discount_cents", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("promo_code", sa.String(length=50), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("promo_code")
        batch.drop_column("discount_cents")

    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_table("promo_codes")
