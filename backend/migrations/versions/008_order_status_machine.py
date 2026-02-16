"""Order status machine fields + normalize statuses.

Revision ID: 008_order_status_machine
Revises: 007_order_public_fields
Create Date: 2026-02-15

"""
from alembic import op
import sqlalchemy as sa

revision = "008_order_status_machine"
down_revision = "007_order_public_fields"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("placed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("prepared_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("assigned_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("cancelled_at", sa.DateTime(), nullable=True))
        batch.alter_column("status", existing_type=sa.String(30), server_default="new", nullable=False)

    # Normalize legacy statuses to new canonical lowercase values.
    op.execute(
        """
        UPDATE orders
        SET status = 'new'
        WHERE status IN ('Created','SentToVendor','CREATED','SENT_TO_VENDOR','SENTTOVENDOR','NEW','new')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'preparing'
        WHERE status IN ('Accepted','Preparing','ACCEPTED','PREPARING','preparing')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'ready'
        WHERE status IN ('Ready','READY','ready','NEEDS_REASSIGN','NeedsReassign','needs_reassign')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'assigned'
        WHERE status IN ('Assigned','ASSIGNED','assigned')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'picked_up'
        WHERE status IN ('PickedUp','PICKED_UP','picked_up')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'delivered'
        WHERE status IN ('Delivered','DELIVERED','delivered')
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'cancelled'
        WHERE status IN ('Cancelled','CANCELLED','cancelled')
        """
    )

    # Backfill timestamps.
    op.execute("UPDATE orders SET placed_at = COALESCE(placed_at, created_at) WHERE placed_at IS NULL")
    op.execute(
        """
        UPDATE orders
        SET prepared_at = COALESCE(prepared_at, vendor_accepted_at)
        WHERE prepared_at IS NULL AND vendor_accepted_at IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE orders
        SET assigned_at = COALESCE(assigned_at, driver_assigned_at)
        WHERE assigned_at IS NULL AND driver_assigned_at IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE orders
        SET cancelled_at = COALESCE(cancelled_at, updated_at)
        WHERE status = 'cancelled' AND cancelled_at IS NULL
        """
    )


def downgrade():
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("cancelled_at")
        batch.drop_column("assigned_at")
        batch.drop_column("prepared_at")
        batch.drop_column("placed_at")
        batch.alter_column("status", existing_type=sa.String(30), server_default=None, nullable=False)
