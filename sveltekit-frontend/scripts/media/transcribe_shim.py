import sys
import json
import os
from faster_whisper import WhisperModel

def transcribe(audio_path, model_size, device):
    model = WhisperModel(model_size, device=device, compute_type="int8")
    segments, info = model.transcribe(audio_path, beam_size=5)
    
    results = []
    full_text = []
    for segment in segments:
        results.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip()
        })
        full_text.append(segment.text.strip())
        
    return {
        "text": " ".join(full_text),
        "chunks": results,
        "language": info.language
    }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_size = sys.argv[2]
    device = sys.argv[3]
    
    try:
        result = transcribe(audio_path, model_size, device)
        print(json.dumps(result))
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)