from .models import Card, Workspace
from .schemas import CardOut, WorkspaceOut


def workspace_out(workspace: Workspace, card_count=0):
    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        color=workspace.color,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        card_count=card_count,
    )


def card_out(card: Card):
    return CardOut(
        id=card.id,
        workspace_id=card.workspace_id,
        content=card.content,
        tags=[tag.name for tag in card.tags],
        created_at=card.created_at,
        updated_at=card.updated_at,
        last_viewed_at=card.last_viewed_at,
    )
