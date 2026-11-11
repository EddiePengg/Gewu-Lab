import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import settings


router = APIRouter(prefix="/assets", tags=["assets"])
EXTENSIONS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
ASSET_NAME = re.compile(r"^[0-9a-f]{32}\.(png|jpg|webp)$")
MAX_IMAGE_SIZE = 10 * 1024 * 1024


@router.post("", status_code=201)
async def upload_asset(file: UploadFile = File(...)):
    extension = EXTENSIONS.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=415, detail="仅支持 PNG、JPEG 和 WebP 图片")
    directory = Path(settings.asset_dir)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{extension}"
    target = directory / name
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_IMAGE_SIZE:
                    raise HTTPException(status_code=413, detail="图片不能超过 10 MB")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return {"url": f"/api/assets/{name}"}


@router.get("/{name}")
def read_asset(name: str):
    if not ASSET_NAME.fullmatch(name):
        raise HTTPException(status_code=404, detail="Asset not found")
    path = Path(settings.asset_dir) / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path)
