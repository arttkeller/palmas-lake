import base64
import binascii
import mimetypes
import os
from typing import Optional

import requests


class AudioTranscriptionService:
    """Transcreve áudios recebidos via webhook usando Groq Whisper."""

    def __init__(self):
        self.api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
        self.model = os.environ.get("GROQ_AUDIO_MODEL", "whisper-large-v3-turbo")
        self.download_timeout_seconds = float(
            os.environ.get("AUDIO_DOWNLOAD_TIMEOUT_SECONDS", "20")
        )

    def is_enabled(self) -> bool:
        return bool(self.api_key)

    def _create_client(self):
        if not self.api_key:
            raise RuntimeError("GROQ_API_KEY não configurada")

        try:
            from groq import Groq
        except Exception as exc:
            raise RuntimeError("Biblioteca 'groq' não instalada") from exc

        return Groq(api_key=self.api_key)

    def transcribe_from_url(self, url: str, filename_hint: str = "audio.m4a") -> Optional[str]:
        """Baixa um áudio por URL e retorna o texto transcrito."""
        if not url:
            return None

        try:
            response = requests.get(url, timeout=self.download_timeout_seconds)
            response.raise_for_status()
            content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip()

            filename = filename_hint or "audio"
            if "." not in filename and content_type:
                extension = mimetypes.guess_extension(content_type)
                if extension:
                    filename = f"{filename}{extension}"

            return self.transcribe_from_bytes(response.content, filename=filename)
        except Exception as exc:
            print(f"[AudioTranscription] Erro ao baixar áudio: {exc}")
            return None

    def transcribe_from_base64(self, data: str, filename: str = "audio.m4a") -> Optional[str]:
        """Transcreve um áudio enviado como base64."""
        if not data:
            return None

        try:
            normalized = data.strip()
            if "," in normalized and normalized.lower().startswith("data:"):
                normalized = normalized.split(",", 1)[1]

            audio_bytes = base64.b64decode(normalized, validate=True)
            return self.transcribe_from_bytes(audio_bytes, filename=filename)
        except (binascii.Error, ValueError) as exc:
            print(f"[AudioTranscription] Base64 inválido para áudio: {exc}")
            return None
        except Exception as exc:
            print(f"[AudioTranscription] Erro ao transcrever áudio base64: {exc}")
            return None

    def transcribe_from_bytes(self, audio_bytes: bytes, filename: str = "audio.m4a") -> Optional[str]:
        """Transcreve bytes de áudio usando Groq Whisper."""
        if not audio_bytes:
            return None

        try:
            client = self._create_client()
            transcription = client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model=self.model,
                temperature=0,
                response_format="verbose_json",
            )
            text = getattr(transcription, "text", None)
            if isinstance(text, str):
                text = text.strip()
            return text or None
        except Exception as exc:
            print(f"[AudioTranscription] Erro na API Groq: {exc}")
            return None
