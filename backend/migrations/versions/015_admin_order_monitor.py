"""Admin order monitor fields.

Revision ID: 015_admin_order_monitor
Revises: 014_menu_management
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "015_admin_order_monitor"
down_revision = "014_menu_management"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("cancel_reason", sa.Text(), nullable=True))
        batch.add_column(
            sa.Column("refund_required", sa.Boolean(), nullable=False, server_default=sa.text("0"))
        )
        batch.add_column(sa.Column("refund_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("internal_notes", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("internal_notes")
        batch.drop_column("refund_note")
        batch.drop_column("refund_required")
        batch.drop_column("cancel_reason")
