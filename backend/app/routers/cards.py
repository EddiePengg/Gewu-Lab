from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Card, Tag, utcnow
from ..schemas import CardOut, CardUpdate
from ..serializers import card_out


router = APIRouter(prefix="/cards", tags=["cards"])


def get_card(card_id: int, db: Session):
    card = db.scalar(
        select(Card).where(Card.id == card_id).options(selectinload(Card.tags))
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("/{card_id}", response_model=CardOut, summary="读取卡片（不记录查看）")
def read_card(card_id: int, db: Session = Depends(get_db)):
    return card_out(get_card(card_id, db))


@router.post("/{card_id}/view", response_model=CardOut, summary="记录一次网页查看")
def view_card(card_id: int, db: Session = Depends(get_db)):
    card = get_card(card_id, db)
    card.last_viewed_at = utcnow()
    db.commit()
    db.refresh(card)
    return card_out(card)


@router.patch("/{card_id}", response_model=CardOut, summary="修改 Markdown 卡片")
def update_card(card_id: int, payload: CardUpdate, db: Session = Depends(get_db)):
    card = get_card(card_id, db)
    changes = payload.model_dump(exclude_unset=True)
    tags = changes.pop("tags", None)
    for field, value in changes.items():
        setattr(card, field, value)
    if tags is not None:
        existing = db.scalars(
            select(Tag).where(Tag.workspace_id == card.workspace_id, Tag.name.in_(tags))
        ).all() if tags else []
        by_name = {tag.name: tag for tag in existing}
        card.tags = [by_name.get(name) or Tag(workspace_id=card.workspace_id, name=name) for name in tags]
    if changes or tags is not None:
        card.updated_at = utcnow()
    db.commit()
    db.refresh(card)
    return card_out(card)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除卡片")
def delete_card(card_id: int, db: Session = Depends(get_db)):
    card = get_card(card_id, db)
    db.delete(card)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
