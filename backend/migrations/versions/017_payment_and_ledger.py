"""Payment method/status + vendor ledger entries.

Revision ID: 017_payment_and_ledger
Revises: 016_promo_codes
Create Date: 2026-02-22
"""
from alembic import op
import sqlalchemy as sa

revision = "017_payment_and_ledger"
down_revision = "016_promo_codes"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("payment_method", sa.String(length=20), nullable=False, server_default="cash"))
        batch.add_column(sa.Column("payment_status", sa.String(length=20), nullable=False, server_default="paid"))

    op.create_table(
        "vendor_ledger_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("amount_ghs", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_vendor_ledger_entries_order_id",
        "vendor_ledger_entries",
        ["order_id"],
        unique=True,
    )
    op.create_index(
        "ix_vendor_ledger_entries_vendor_id",
        "vendor_ledger_entries",
        ["vendor_id"],
    )


def downgrade():
    op.drop_index("ix_vendor_ledger_entries_vendor_id", table_name="vendor_ledger_entries")
    op.drop_index("ix_vendor_ledger_entries_order_id", table_name="vendor_ledger_entries")
    op.drop_table("vendor_ledger_entries")

    with op.batch_alter_table("orders") as batch:
        batch.drop_column("payment_status")
        batch.drop_column("payment_method")
