# ruff: noqa: E501, E402
"""Provedor oficial Google GenAI SDK (google-genai) para B3 Triple Screen."""

import os
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

from src.ai.providers.base import BaseLLMProvider

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "gemini-flash-latest"


class GeminiProvider(BaseLLMProvider):
    """Provedor primário utilizando o SDK oficial google-genai."""

    def __init__(self, api_key: str | None = None, model: str = DEFAULT_MODEL):
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self._api_key:
            raise ValueError(
                "Chave de API do Gemini não configurada. Defina GEMINI_API_KEY no ambiente "
                "ou forneça explicitamente no construtor."
            )
        self.model = model
        self.client = genai.Client(api_key=self._api_key)

    @property
    def provider_name(self) -> str:
        return "gemini_official"

    def generate_structured(
        self, prompt: str, schema: type[T], system_instruction: str | None = None
    ) -> T:
        """Gera conteúdo estruturado validado contra schema Pydantic."""
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            system_instruction=system_instruction,
            temperature=0.2,
        )
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=config,
        )
        if not response.text:
            raise RuntimeError(f"Resposta vazia retornada pelo modelo {self.model}.")
        return schema.model_validate_json(response.text)

    def generate_text(self, prompt: str, system_instruction: str | None = None) -> str:
        """Gera resposta em texto livre."""
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.3,
        )
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=config,
        )
        return response.text or ""
