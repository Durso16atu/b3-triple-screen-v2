# ruff: noqa: E501, E402
"""Provedor de conexão com o Gateway local OmniRoute (OpenAI-compatible)."""

import json
import os
from typing import TypeVar

import httpx
from pydantic import BaseModel

from src.ai.providers.base import BaseLLMProvider

T = TypeVar("T", bound=BaseModel)

DEFAULT_BASE_URL = "http://localhost:20128/v1"
DEFAULT_API_KEY = "sk-e5650593c583ea28-1ae982-99063689"
DEFAULT_MODEL = "gemini-3.1-flash-lite"


class OmniRouteProvider(BaseLLMProvider):
    """Provedor alternativo/fallback conectado ao OmniRoute local."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        timeout: float = 45.0,
    ):
        self.base_url = (
            base_url or os.environ.get("OMNIROUTE_BASE_URL") or DEFAULT_BASE_URL
        ).rstrip("/")
        self.api_key = api_key or os.environ.get("OMNIROUTE_API_KEY") or DEFAULT_API_KEY
        self.model = model
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "omniroute_local"

    def _get_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def generate_structured(
        self, prompt: str, schema: type[T], system_instruction: str | None = None
    ) -> T:
        """Gera resposta via endpoint /chat/completions validando no schema Pydantic."""
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        structured_prompt = (
            f"{prompt}\n\n"
            "IMPORTANTE: Você DEVE responder ESTRITAMENTE em formato JSON compatível com o seguinte JSON Schema, "
            "sem markdown em volta, sem blocos de código (ex: ```json), apenas o JSON puro:\n"
            f"{schema_json}"
        )

        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": structured_prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.base_url}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError(f"OmniRoute retornou resposta vazia: {data}")

        raw_text = choices[0]["message"]["content"].strip()
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_text = "\n".join(lines).strip()
        start_idx = raw_text.find("{")
        end_idx = raw_text.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            raw_text = raw_text[start_idx : end_idx + 1]

        return schema.model_validate_json(raw_text)

    def generate_text(self, prompt: str, system_instruction: str | None = None) -> str:
        """Gera resposta de texto padrão no OmniRoute."""
        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
        }

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.base_url}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        choices = data.get("choices", [])
        if not choices:
            return ""
        return choices[0]["message"]["content"]
