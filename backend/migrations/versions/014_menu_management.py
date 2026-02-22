"""Menu categories + add-ons + menu item fields.

Revision ID: 014_menu_management
Revises: 013_fee_engine
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa

revision = "014_menu_management"
down_revision = "013_fee_engine"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "menu_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "addon_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("min_select", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_select", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "addon_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("addon_groups.id"), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "menu_item_addon_groups",
        sa.Column("menu_item_id", sa.Integer(), sa.ForeignKey("menu_items.id"), primary_key=True),
        sa.Column("addon_group_id", sa.Integer(), sa.ForeignKey("addon_groups.id"), primary_key=True),
    )

    with op.batch_alter_table("menu_items") as batch:
        batch.add_column(sa.Column("category_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("image_url", sa.String(length=500), nullable=True))
        batch.create_foreign_key(
            "fk_menu_items_category_id",
            "menu_categories",
            ["category_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("menu_items") as batch:
        batch.drop_constraint("fk_menu_items_category_id", type_="foreignkey")
        batch.drop_column("image_url")
        batch.drop_column("category_id")

    op.drop_table("menu_item_addon_groups")
    op.drop_table("addon_options")
    op.drop_table("addon_groups")
    op.drop_table("menu_categories")
