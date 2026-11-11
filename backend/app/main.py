from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .auth import require_bearer
from .config import settings
from .database import SessionLocal
from .routers import ai, assets, cards, workspaces


app = FastAPI(
    title="格物 Lab API",
    version="0.2.0",
    description="供 AI 与外部客户端使用的 /api/v1 API。使用 Authorization: Bearer <GEWU_API_TOKEN>；卡片正文支持 Markdown 和 LaTeX。",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (workspaces.router, cards.router, ai.router, assets.router):
    app.include_router(router, prefix="/api", include_in_schema=False)
    app.include_router(router, prefix="/api/v1", dependencies=[Depends(require_bearer)])


@app.get("/api/health", tags=["system"], summary="服务健康检查")
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}


static_dir = Path(settings.static_dir)
if (static_dir / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="static-assets")

    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(static_dir / "index.html")
