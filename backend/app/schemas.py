from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#6575d8", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name", "description")
    @classmethod
    def strip_text(cls, value):
        return value.strip()


class WorkspaceOut(BaseModel):
    id: int
    name: str
    description: str
    color: str
    created_at: datetime
    updated_at: datetime
    card_count: int = 0


class CardCreate(BaseModel):
    content: str = Field(
        default="",
        json_schema_extra={"example": "# 勾股定理\n\n直角三角形满足：\n\n$$\na^2+b^2=c^2\n$$"},
    )
    tags: list[str] = Field(default_factory=list, max_length=12, examples=[["数学", "几何"]])

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values):
        return list(dict.fromkeys(value.strip()[:40] for value in values if value.strip()))


class CardUpdate(BaseModel):
    content: Optional[str] = None
    tags: Optional[list[str]] = Field(default=None, max_length=12)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values):
        if values is None:
            return values
        return list(dict.fromkeys(value.strip()[:40] for value in values if value.strip()))


class CardOut(BaseModel):
    id: int
    workspace_id: int
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    last_viewed_at: Optional[datetime]
