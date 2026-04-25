from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import orjson

from app.routes import rag, kag, kb, chat

app = FastAPI(title="RAG+KAG Gateway", version="0.1.0")

app.include_router(rag.router, prefix="/rag")
app.include_router(kag.router, prefix="/kag")
app.include_router(kb.router, prefix="/kb")
app.include_router(chat.router, prefix="/chat")

@app.get("/health")
def health():
    return {"status": "ok"}
