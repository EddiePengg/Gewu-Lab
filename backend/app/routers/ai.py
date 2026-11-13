from typing import Literal, Optional

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

CHAT_SYSTEM_PROMPT = """你是格物 Lab 卡片编辑器中的 AI 副驾驶，与用户围绕当前卡片持续对话。
回答用户的问题，解释概念、检查思路并参与讨论；不要默认改写卡片或只输出待插入的内容。
只有用户明确要求生成、改写或补充卡片内容时，才输出对应的 Markdown。
回答应简洁清晰，数学内容使用 LaTeX：行内公式使用 $...$，独立公式将 $$ 放在单独的行。
当前卡片和选区会随最新消息提供；结合聊天历史理解追问，不要重复已经说过的内容。"""


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


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class AIChatRequest(BaseModel):
    document: str
    selection: str
    messages: list[AIChatMessage] = Field(min_length=1, max_length=40)
    system_prompt: str = Field(default="", max_length=4000)


def stream_completion(messages):
    if not settings.ai_api_key:
        raise HTTPException(status_code=503, detail="AI 尚未配置，请在后端设置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL")

    client = OpenAI(api_key=settings.ai_api_key, base_url=settings.ai_base_url, timeout=120)
    stream = client.chat.completions.create(
        model=settings.ai_model,
        messages=messages,
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


@router.post("/edit")
def edit(payload: AIEditRequest):
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
        system_prompt += f"\n\n用户附加提示词：{payload.system_prompt}"

    return stream_completion([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ])


@router.post("/chat")
def chat(payload: AIChatRequest):
    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="最后一条消息必须来自用户")

    system_prompt = CHAT_SYSTEM_PROMPT
    if payload.system_prompt:
        system_prompt += f"\n\n用户附加提示词：{payload.system_prompt}"

    messages = [{"role": "system", "content": system_prompt}]
    for index, message in enumerate(payload.messages):
        content = message.content
        if index == len(payload.messages) - 1:
            content = f"""<document>
{payload.document}
</document>
<selection>
{payload.selection}
</selection>
<message>
{content}
</message>"""
        messages.append({"role": message.role, "content": content})

    return stream_completion(messages)
