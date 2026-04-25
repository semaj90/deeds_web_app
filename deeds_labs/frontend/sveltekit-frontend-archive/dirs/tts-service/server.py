import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from gtts import gTTS
import io

app = FastAPI()

class TTSRequest(BaseModel):
    text: str
    lang: str = 'en'

@app.post("/synthesize")
async def synthesize(request: TTSRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        tts = gTTS(text=request.text, lang=request.lang)

        # Save to a memory file
        mp3_fp = io.BytesIO()
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)

        return StreamingResponse(mp3_fp, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "TTS service is running."}

if __name__ == "__main__":
    # The port should be configured via environment variables or a config file.
    # Using port 8096 as an example for the TTS service.
    uvicorn.run(app, host="0.0.0.0", port=8096)
