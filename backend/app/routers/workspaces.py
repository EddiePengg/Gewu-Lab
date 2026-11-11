from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Card, Tag, Workspace
from ..schemas import CardCreate, CardOut, WorkspaceCreate, WorkspaceOut
from ..serializers import card_out, workspace_out


router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def get_workspace(workspace_id: int, db: Session):
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


def card_counts(db: Session, workspace_ids):
    if not workspace_ids:
        return {}
    rows = db.execute(
        select(Card.workspace_id, func.count(Card.id))
        .where(Card.workspace_id.in_(workspace_ids))
        .group_by(Card.workspace_id)
    ).all()
    return dict(rows)


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db)):
    workspaces = db.scalars(select(Workspace).order_by(Workspace.created_at)).all()
    counts = card_counts(db, [workspace.id for workspace in workspaces])
    return [workspace_out(workspace, counts.get(workspace.id, 0)) for workspace in workspaces]


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    workspace = Workspace(**payload.model_dump())
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace_out(workspace)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def read_workspace(workspace_id: int, db: Session = Depends(get_db)):
    workspace = get_workspace(workspace_id, db)
    counts = card_counts(db, [workspace.id])
    return workspace_out(workspace, counts.get(workspace.id, 0))


@router.get("/{workspace_id}/cards", response_model=list[CardOut])
def list_cards(
    workspace_id: int,
    query: str = Query(default="", max_length=200),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    get_workspace(workspace_id, db)
    statement = select(Card).where(Card.workspace_id == workspace_id).options(selectinload(Card.tags))
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(Card.content.ilike(pattern), Card.tags.any(Tag.name.ilike(pattern)))
        )
    cards = db.scalars(
        statement.order_by(Card.updated_at.desc()).limit(limit).offset(offset)
    ).all()
    return [card_out(card) for card in cards]


@router.post("/{workspace_id}/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(workspace_id: int, payload: CardCreate, db: Session = Depends(get_db)):
    workspace = get_workspace(workspace_id, db)
    card = Card(workspace_id=workspace.id, content=payload.content)
    names = payload.tags
    existing = db.scalars(
        select(Tag).where(Tag.workspace_id == workspace.id, Tag.name.in_(names))
    ).all() if names else []
    by_name = {tag.name: tag for tag in existing}
    card.tags = [by_name.get(name) or Tag(workspace_id=workspace.id, name=name) for name in names]
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_out(card)
