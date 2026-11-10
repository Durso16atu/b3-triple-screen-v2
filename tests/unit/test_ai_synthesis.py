"""Testes unitários para o módulo de IA e Síntese de Mercado (src/ai)."""

from unittest.mock import MagicMock, patch

import pytest

from src.ai.providers.base import BaseLLMProvider
from src.ai.providers.gemini import GeminiProvider
from src.ai.providers.omniroute import OmniRouteProvider
from src.ai.schemas import (
    MacroOverview,
    MarketBriefing,
    TickerAssessment,
)
from src.ai.synthesizer import MarketSynthesizer


@pytest.fixture
def sample_snapshot_data():
    return {
        "metadata": {
            "session_date": "2026-10-23",
            "cdi_rate_annual": 0.1365,
            "active_maturity": {
                "maturity_date": "2026-11-19",
                "days_to_maturity_du": 18,
                "call_series": "K",
                "put_series": "W",
            },
        },
        "underlyings": [
            {
                "ticker": "PETR4",
                "spot_price": 58.68,
                "trend_signal": "ALTA",
                "phase": "A_CAMINHO",
                "stoch_k": 82.45,
                "stoch_d": 83.41,
                "phicube": {
                    "confluence_verdict": "FORTE_COMPRA",
                    "pv_pc_rule": "PV_PROIBIDO_VENDER",
                    "caiu_comprou_72": 55.27,
                    "levantou_cortou_72": 43.19,
                },
            }
        ],
    }


@pytest.fixture
def sample_briefing():
    return MarketBriefing(
        overview=MacroOverview(
            session_date="2026-10-23",
            cdi_rate_annual=0.1365,
            days_to_maturity_du=18,
            active_series="K / W",
            market_sentiment="OTIMISTA_MODERADO",
            key_risks=["PETR4 estocástico sobrecomprado acima de 80"],
        ),
        highlighted_tickers=[
            TickerAssessment(
                ticker="PETR4",
                spot_price=58.68,
                trend="ALTA",
                phase="A_CAMINHO",
                stoch_k=82.45,
                confluence_verdict="FORTE_COMPRA",
                assessment="Em alta, porém em fase A_CAMINHO esticada. Aguardar pullback.",
                hedging_suggestion="Venda coberta OTM série K ou trave de baixa para proteção.",
            )
        ],
        actionable_recommendations=["Aguardar teste de suporte EMA13 em PETR4."],
    )


def test_schemas_validation(sample_briefing):
    """Verifica se os schemas Pydantic serializam e desserializam perfeitamente."""
    json_str = sample_briefing.model_dump_json()
    reconstructed = MarketBriefing.model_validate_json(json_str)

    assert reconstructed.overview.session_date == "2026-10-23"
    assert reconstructed.overview.days_to_maturity_du == 18
    assert reconstructed.highlighted_tickers[0].ticker == "PETR4"
    assert reconstructed.highlighted_tickers[0].stoch_k == 82.45


def test_synthesizer_payload_preparation(sample_snapshot_data):
    """Verifica se a extração de dados do snapshot mantém apenas o essencial."""
    synthesizer = MarketSynthesizer(provider=MagicMock(spec=BaseLLMProvider))
    payload = synthesizer._prepare_summary_payload(sample_snapshot_data)

    assert payload["metadata"]["session_date"] == "2026-10-23"
    assert payload["metadata"]["days_to_maturity_du"] == 18
    assert len(payload["sample_tickers"]) == 1
    assert payload["sample_tickers"][0]["ticker"] == "PETR4"
    assert payload["sample_tickers"][0]["caiu_comprou_72"] == 55.27


def test_synthesizer_with_mock_provider(sample_snapshot_data, sample_briefing):
    """Verifica a geração estruturada via provedor mockado."""
    mock_provider = MagicMock(spec=BaseLLMProvider)
    mock_provider.generate_structured.return_value = sample_briefing

    synthesizer = MarketSynthesizer(provider=mock_provider)
    result = synthesizer.synthesize_from_dict(sample_snapshot_data)

    assert result.overview.session_date == "2026-10-23"
    assert result.highlighted_tickers[0].ticker == "PETR4"
    mock_provider.generate_structured.assert_called_once()


def test_synthesizer_default_provider_fallback(monkeypatch):
    """Verifica se o OmniRoute é selecionado quando GEMINI_API_KEY não existe."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    synthesizer = MarketSynthesizer()
    assert isinstance(synthesizer.provider, OmniRouteProvider)
    assert synthesizer.provider.provider_name == "omniroute_local"


def test_gemini_provider_mock(sample_briefing):
    """Verifica chamada ao cliente oficial google-genai."""
    mock_response = MagicMock()
    mock_response.text = sample_briefing.model_dump_json()

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        provider = GeminiProvider(api_key="mock_key", model="gemini-2.5-flash")
        res = provider.generate_structured(prompt="prompt", schema=MarketBriefing)

        assert res.overview.session_date == "2026-10-23"
        mock_client.models.generate_content.assert_called_once()


def test_omniroute_provider_mock(sample_briefing):
    """Verifica chamada HTTP do OmniRoute com parsing de schema Pydantic."""
    fake_response = {
        "choices": [
            {
                "message": {
                    "content": sample_briefing.model_dump_json(),
                }
            }
        ]
    }

    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_response
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.Client.post", return_value=mock_resp):
        provider = OmniRouteProvider(base_url="http://localhost:20128/v1", api_key="sk-test")
        res = provider.generate_structured(prompt="prompt", schema=MarketBriefing)

        assert res.overview.session_date == "2026-10-23"
        assert res.highlighted_tickers[0].ticker == "PETR4"
