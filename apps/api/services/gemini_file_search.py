import os
import logging

logger = logging.getLogger(__name__)


class GeminiFileSearchService:
    """Serviço para consultar documentos técnicos via Google Gemini File Search."""

    def __init__(self):
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")

        self.client = genai.Client(api_key=api_key)
        self.store_name = os.environ.get("GEMINI_FILE_SEARCH_STORE", "").strip()
        if not self.store_name:
            raise RuntimeError("GEMINI_FILE_SEARCH_STORE not configured")

    def query(self, question: str) -> str:
        """Consulta os documentos técnicos do empreendimento via Gemini File Search.

        Args:
            question: Pergunta técnica sobre o empreendimento.

        Returns:
            Resposta baseada nos documentos indexados.
        """
        from google.genai import types

        try:
            response = self.client.models.generate_content(
                model="gemini-3.1-flash-lite",
                contents=(
                    "Com base nos documentos técnicos do empreendimento Palmas Lake Towers, "
                    f"responda de forma objetiva e concisa em português: {question}"
                ),
                config=types.GenerateContentConfig(
                    tools=[
                        types.Tool(
                            file_search=types.FileSearch(
                                file_search_store_names=[self.store_name]
                            )
                        )
                    ]
                ),
            )
            return response.text or "Não encontrei informações sobre isso nos documentos técnicos."
        except Exception as e:
            logger.error(f"Gemini File Search error: {e}")
            return "Informação técnica não disponível no momento."
