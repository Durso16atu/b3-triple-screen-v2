# ruff: noqa: E501, E402
"""Orquestrador de síntese executiva do snapshot diário do B3 Triple Screen v2."""

import json
import logging
import os
from pathlib import Path
from typing import Any

from src.ai.providers.base import BaseLLMProvider
from src.ai.providers.gemini import GeminiProvider
from src.ai.providers.omniroute import OmniRouteProvider
from src.ai.schemas import MarketBriefing

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é o Especialista Chefe em Análise Quantitativa e Atuarial do B3 Triple Screen v2.0.
Sua função é gerar um briefing executivo rigoroso, objetivo e disciplinado sobre o fechamento do mercado.

REGRAS DISCIPLINARES OBRIGATÓRIAS (LIÇÕES DE MERCADO):
1. [LL-MKT-001]: Quando ativos em tendência de ALTA estiverem na fase 'A_CAMINHO' com Estocástico %K acima de 80 e gatilho_entrada nulo, NUNCA recomendar compra a mercado. A disciplina estrita exige aguardar pullback até o suporte Fibonacci/EMA13 ou avaliar estruturas de venda coberta/travas de baixa para captura de volatilidade.
2. Seja estritamente técnico: baseie-se em suportes, resistências, alinhamento de Mimas PhiCube, confluência e dias úteis até o vencimento (DU).
3. Não invente tickers nem dados que não estejam presentes no payload fornecido.
"""


class MarketSynthesizer:
    """Consome o snapshot diário e gera o briefing estruturado via LLM."""

    def __init__(self, provider: BaseLLMProvider | None = None):
        if provider is not None:
            self.provider = provider
        elif os.environ.get("GEMINI_API_KEY"):
            self.provider = GeminiProvider()
        else:
            logger.info(
                "GEMINI_API_KEY não encontrada no ambiente; utilizando OmniRoute local como fallback."
            )
            self.provider = OmniRouteProvider()

    def _prepare_summary_payload(
        self, raw_data: dict[str, Any], max_tickers: int = 10
    ) -> dict[str, Any]:
        """Extrai os dados mais relevantes do snapshot para manter o prompt enxuto e informativo."""
        meta = raw_data.get("metadata", {})
        active_mat = meta.get("active_maturity", {})
        underlyings = raw_data.get("underlyings", [])

        # Filtrar e ordenar ativos com maior relevância técnica
        filtered_tickers: list[dict[str, Any]] = []
        for u in underlyings[:max_tickers]:
            phicube = u.get("phicube", {})
            filtered_tickers.append(
                {
                    "ticker": u.get("ticker"),
                    "spot_price": u.get("spot_price"),
                    "trend_signal": u.get("trend_signal"),
                    "phase": u.get("phase"),
                    "stoch_k": u.get("stoch_k"),
                    "stoch_d": u.get("stoch_d"),
                    "confluence_verdict": phicube.get("confluence_verdict"),
                    "pv_pc_rule": phicube.get("pv_pc_rule"),
                    "caiu_comprou_72": phicube.get("caiu_comprou_72"),
                    "levantou_cortou_72": phicube.get("levantou_cortou_72"),
                }
            )

        return {
            "metadata": {
                "session_date": meta.get("session_date"),
                "cdi_rate_annual": meta.get("cdi_rate_annual"),
                "active_maturity_date": active_mat.get("maturity_date"),
                "days_to_maturity_du": active_mat.get("days_to_maturity_du"),
                "call_series": active_mat.get("call_series"),
                "put_series": active_mat.get("put_series"),
            },
            "sample_tickers": filtered_tickers,
        }

    def synthesize_from_dict(self, snapshot_data: dict[str, Any]) -> MarketBriefing:
        """Gera o briefing estruturado a partir do dicionário do snapshot."""
        payload = self._prepare_summary_payload(snapshot_data)
        prompt = (
            "Com base nos dados consolidados do fechamento do pregão B3 a seguir, "
            "elabore o briefing executivo de mercado:\n\n"
            f"{json.dumps(payload, indent=2, ensure_ascii=False)}"
        )
        return self.provider.generate_structured(
            prompt=prompt,
            schema=MarketBriefing,
            system_instruction=SYSTEM_PROMPT,
        )

    def synthesize_from_file(self, snapshot_path: Path | str) -> MarketBriefing:
        """Lê o arquivo latest.json e gera o briefing estruturado."""
        path = Path(snapshot_path)
        if not path.is_file():
            raise FileNotFoundError(f"Arquivo de snapshot não encontrado: {path}")

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        return self.synthesize_from_dict(data)
