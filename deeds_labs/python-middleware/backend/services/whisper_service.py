"""
Whisper ASR (Automatic Speech Recognition) Service
Wraps OpenAI Whisper for audio/video transcription
GPU-accelerated with RTX 3060 Ti (8GB VRAM)
"""

import asyncio
from pathlib import Path
from typing import Optional, List, Dict
import torch
import whisper
from whisper.audio import SAMPLE_RATE, N_FFT, HOP_LENGTH, N_MELS
import numpy as np
import tempfile

class TranscriptSegment:
    """Single transcribed segment with timing"""
    def __init__(self, start: float, end: float, text: str, confidence: float = 1.0):
        self.start = start  # seconds
        self.end = end      # seconds
        self.text = text
        self.confidence = confidence

    def to_dict(self):
        return {
            "start": self.start,
            "end": self.end,
            "text": self.text,
            "confidence": self.confidence,
            "duration": self.end - self.start
        }

class TranscriptionResult:
    """Complete transcription result"""
    def __init__(self, text: str, language: str, segments: List[TranscriptSegment]):
        self.text = text
        self.language = language
        self.segments = segments

    def to_dict(self):
        return {
            "text": self.text,
            "language": self.language,
            "segments": [s.to_dict() for s in self.segments],
            "word_count": len(self.text.split()),
            "duration": self.segments[-1].end if self.segments else 0.0
        }

class WhisperService:
    """
    Whisper transcription service with GPU acceleration
    Model: base.en (74M params, ~2.9GB VRAM)

    Usage:
        service = WhisperService()
        await service.initialize()
        result = await service.transcribe(audio_bytes)
    """

    # Model size -> VRAM mapping
    MODEL_VRAM = {
        "tiny": 1.0,    # 39M params
        "base": 1.5,    # 74M params
        "small": 2.3,   # 244M params
        "medium": 4.6,  # 769M params
        "large": 7.5,   # 1550M params
    }

    def __init__(self, model_name: str = "base.en", device: Optional[str] = None):
        """
        Args:
            model_name: Whisper model (tiny/base/small/medium/large, .en suffix for English-only)
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[whisper.Whisper] = None
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Load Whisper model onto GPU/CPU"""
        if self.model is not None:
            return

        async with self._lock:
            if self.model is not None:
                return

            # Run blocking model load in executor
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                lambda: whisper.load_model(self.model_name, device=self.device)
            )

            # Warmup inference (primes CUDA kernels)
            dummy_audio = np.zeros(SAMPLE_RATE * 3, dtype=np.float32)  # 3 seconds of silence
            await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(dummy_audio, language="en", verbose=False)
            )

    async def transcribe(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = False,
        vad_filter: bool = True
    ) -> TranscriptionResult:
        """
        Transcribe audio to text

        Args:
            audio_bytes: Raw audio data (WAV/MP3/M4A/etc)
            language: Language code ('en', 'es', etc) or None for auto-detect
            task: 'transcribe' or 'translate' (to English)
            word_timestamps: Enable word-level timestamps
            vad_filter: Apply voice activity detection

        Returns:
            TranscriptionResult with text and segments
        """
        if self.model is None:
            await self.initialize()

        # Save bytes to temp file (Whisper uses ffmpeg internally)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.audio') as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Run inference in executor (blocking CUDA ops)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    tmp_path,
                    language=language,
                    task=task,
                    word_timestamps=word_timestamps,
                    vad_filter=vad_filter,
                    verbose=False
                )
            )

            # Parse segments
            segments = []
            for seg in result.get('segments', []):
                segments.append(TranscriptSegment(
                    start=seg['start'],
                    end=seg['end'],
                    text=seg['text'].strip(),
                    confidence=seg.get('confidence', 1.0)
                ))

            return TranscriptionResult(
                text=result['text'].strip(),
                language=result.get('language', language or 'unknown'),
                segments=segments
            )
        finally:
            # Cleanup temp file
            Path(tmp_path).unlink(missing_ok=True)

    async def transcribe_file(
        self,
        file_path: Path,
        **transcribe_kwargs
    ) -> TranscriptionResult:
        """
        Transcribe audio/video file

        Args:
            file_path: Path to audio/video file
            **transcribe_kwargs: Passed to transcribe()

        Returns:
            TranscriptionResult
        """
        audio_bytes = file_path.read_bytes()
        return await self.transcribe(audio_bytes, **transcribe_kwargs)

    async def detect_language(self, audio_bytes: bytes) -> Dict[str, float]:
        """
        Detect spoken language probabilities

        Args:
            audio_bytes: Raw audio data

        Returns:
            Dict of language codes -> probabilities
        """
        if self.model is None:
            await self.initialize()

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.audio') as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Load audio
            loop = asyncio.get_event_loop()
            audio = await loop.run_in_executor(
                None,
                lambda: whisper.load_audio(tmp_path)
            )
            audio = whisper.pad_or_trim(audio)

            # Make log-Mel spectrogram and move to device
            mel = whisper.log_mel_spectrogram(audio).to(self.device)

            # Detect language
            _, probs = await loop.run_in_executor(
                None,
                lambda: self.model.detect_language(mel)
            )

            return {lang: float(prob) for lang, prob in probs.items()}
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    async def extract_audio_features(self, audio_bytes: bytes) -> np.ndarray:
        """
        Extract Whisper's internal audio embeddings (512-dim)

        Args:
            audio_bytes: Raw audio data

        Returns:
            Audio embedding vector (512-dim)
        """
        if self.model is None:
            await self.initialize()

        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.audio') as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Load and preprocess audio
            loop = asyncio.get_event_loop()
            audio = await loop.run_in_executor(
                None,
                lambda: whisper.load_audio(tmp_path)
            )
            audio = whisper.pad_or_trim(audio)
            mel = whisper.log_mel_spectrogram(audio).to(self.device)

            # Extract encoder features (last layer pooling)
            with torch.no_grad():
                features = await loop.run_in_executor(
                    None,
                    lambda: self.model.encoder(mel.unsqueeze(0))
                )
                # Mean pooling over time dimension
                pooled = features.mean(dim=1).squeeze(0).cpu().numpy()

            return pooled  # Shape: (512,)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def get_stats(self) -> dict:
        """Return service statistics"""
        return {
            "model": self.model_name,
            "device": self.device,
            "initialized": self.model is not None,
            "cuda_available": torch.cuda.is_available(),
            "cuda_device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "vram_allocated_mb": torch.cuda.memory_allocated() / (1024**2) if torch.cuda.is_available() else 0,
            "estimated_vram_mb": self.MODEL_VRAM.get(self.model_name.split('.')[0], 2.0) * 1024
        }


# Singleton instance
_whisper_service: Optional[WhisperService] = None

def get_whisper_service() -> WhisperService:
    """Get singleton WhisperService instance"""
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService()
    return _whisper_service
