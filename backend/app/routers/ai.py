from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field, field_validator

from ..config import settings


router = APIRouter(prefix="/ai", tags=["ai"])

SYSTEM_PROMPT = """你是格物 Lab 卡片编辑器中的 AI 助手。
只输出可直接插入编辑器或替换选区的 Markdown，不要输出解释、前言或包裹全文的代码围栏。
保留用户原文的含义，除非用户明确要求改写。
数学内容使用 LaTeX：行内公式使用 $...$，独立公式将 $$ 放在单独的行。
如果提供图片，识别其中的文字、公式与表格，输出排版准确的 Markdown 和 LaTeX。"""


class AIEditRequest(BaseModel):
    document: str
    selection: str
    instruction: str = Field(min_length=1, max_length=4000)
    system_prompt: str = Field(default="", max_length=4000)
    image: Optional[str] = None

    @field_validator("image")
    @classmethod
    def validate_image(cls, value):
        if value is None:
            return value
        if not value.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
            raise ValueError("Only PNG, JPEG, and WebP images are supported")
        if len(value) > 14_000_000:
            raise ValueError("Image is too large")
        return value


@router.post("/edit")
def edit(payload: AIEditRequest):
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI 尚未配置，请在后端设置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL")

    prompt = f"""<document>
{payload.document}
</document>
<selection>
{payload.selection}
</selection>
<instruction>
{payload.instruction}
</instruction>"""
    content = [{"type": "text", "text": prompt}]
    if payload.image:
        content.append({"type": "image_url", "image_url": {"url": payload.image}})

    system_prompt = SYSTEM_PROMPT
    if payload.system_prompt:
        system_prompt += f"\n\n用户附加提示词：\n{payload.system_prompt}"

    client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url, timeout=120)
    stream = client.chat.completions.create(
        model=settings.ai_model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": content}],
        stream=True,
    )

    def generate():
        try:
            for chunk in stream:
                if not chunk.choices:
                    continue
                text = chunk.choices[0].delta.content
                if text:
                    yield text
        finally:
            stream.close()
            client.close()

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")
