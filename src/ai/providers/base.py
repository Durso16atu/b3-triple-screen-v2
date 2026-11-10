# ruff: noqa: E501, E402
"""Interface base abstrata para provedores de LLM."""

from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class BaseLLMProvider(ABC):
    """Contrato abstrato que todo provedor de modelo deve implementar."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Nome identificador do provedor."""
        ...

    @abstractmethod
    def generate_structured(
        self, prompt: str, schema: type[T], system_instruction: str | None = None
    ) -> T:
        """Gera uma resposta estritamente estruturada e validada no schema Pydantic."""
        ...

    @abstractmethod
    def generate_text(self, prompt: str, system_instruction: str | None = None) -> str:
        """Gera uma resposta textual livre."""
        ...
