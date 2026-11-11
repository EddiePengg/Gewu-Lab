"""Unify entries as Markdown cards and track views.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table("entry_tags", "card_tags")
    with op.batch_alter_table("card_tags") as batch:
        batch.alter_column("entry_id", new_column_name="card_id")
    op.rename_table("entries", "cards")
    op.execute(
        """
        UPDATE cards SET content = content
            || CASE WHEN solution <> '' THEN '\n\n## 解答\n\n' || solution ELSE '' END
            || CASE WHEN error_reason <> '' THEN '\n\n## 错因与复盘\n\n' || error_reason ELSE '' END
        """
    )
    with op.batch_alter_table("cards") as batch:
        batch.add_column(sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.drop_constraint("ck_entries_kind", type_="check")
        batch.drop_column("kind")
        batch.drop_column("title")
        batch.drop_column("solution")
        batch.drop_column("error_reason")
    op.drop_index("ix_entries_workspace_id", table_name="cards")
    op.drop_index("ix_entries_updated_at", table_name="cards")
    op.create_index("ix_cards_workspace_id", "cards", ["workspace_id"])
    op.create_index("ix_cards_updated_at", "cards", ["updated_at"])


def downgrade():
    with op.batch_alter_table("card_tags") as batch:
        batch.alter_column("card_id", new_column_name="entry_id")
    op.rename_table("card_tags", "entry_tags")
    op.drop_index("ix_cards_workspace_id", table_name="cards")
    op.drop_index("ix_cards_updated_at", table_name="cards")
    op.create_index("ix_entries_workspace_id", "cards", ["workspace_id"])
    op.create_index("ix_entries_updated_at", "cards", ["updated_at"])
    with op.batch_alter_table("cards") as batch:
        batch.add_column(sa.Column("error_reason", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("solution", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("title", sa.String(length=200), nullable=False, server_default="Untitled"))
        batch.add_column(sa.Column("kind", sa.String(length=20), nullable=False, server_default="knowledge"))
        batch.create_check_constraint("ck_entries_kind", "kind IN ('knowledge', 'problem')")
        batch.drop_column("last_viewed_at")
    op.rename_table("cards", "entries")
