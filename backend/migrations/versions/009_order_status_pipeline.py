"""Add accepted/declined fields and placed status.

Revision ID: 009_order_status_pipeline
Revises: 008_order_status_machine
Create Date: 2026-02-20

"""
from alembic import op
import sqlalchemy as sa

revision = "009_order_status_pipeline"
down_revision = "008_order_status_machine"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("accepted_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("declined_at", sa.DateTime(), nullable=True))
        batch.alter_column("status", existing_type=sa.String(30), server_default="placed", nullable=False)

    with op.batch_alter_table("order_items") as batch:
        batch.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch.add_column(
            sa.Column("allow_substitution", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("substitution_note", sa.Text(), nullable=True))

    op.execute(
        """
        UPDATE orders
        SET status = 'placed'
        WHERE status IN ('new','NEW','Created','CREATED','SentToVendor','SENT_TO_VENDOR','SENTTOVENDOR')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'accepted'
        WHERE status IN ('accepted','ACCEPTED')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'declined'
        WHERE status IN ('declined','DECLINED')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'delivered'
        WHERE status IN ('completed','COMPLETED')
        """
    )


def downgrade():
    with op.batch_alter_table("order_items") as batch:
        batch.drop_column("substitution_note")
        batch.drop_column("allow_substitution")
        batch.drop_column("notes")

    with op.batch_alter_table("orders") as batch:
        batch.drop_column("declined_at")
        batch.drop_column("accepted_at")
        batch.alter_column("status", existing_type=sa.String(30), server_default="new", nullable=False)
