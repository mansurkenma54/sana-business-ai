"""Guest-accessible business diagnosis; profiles are not persisted."""

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from core import business


router = APIRouter(prefix="/api/business", tags=["Business"])
MAX_BODY_BYTES = 24 * 1024


def _response(result: dict) -> JSONResponse:
    if "error" in result:
        return JSONResponse({"ok": False, "error": result["error"]}, status_code=400)
    return JSONResponse({"ok": True, "data": result})


def _invalid(message: str) -> JSONResponse:
    return _response({"error": {"code": "invalid_input", "message": message}})


@router.get("/templates")
def list_templates(locale: str = "ru") -> JSONResponse:
    return _response(business.templates(locale))


@router.post("/diagnose")
async def diagnose(request: Request) -> JSONResponse:
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY_BYTES:
            return _invalid("Слишком большой запрос. Сократите описание бизнеса.")
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return _invalid("Тело запроса должно быть корректным JSON.")
    # The provider SDK is synchronous; keep unrelated requests responsive.
    result = await run_in_threadpool(business.diagnose, body)
    return _response(result)
