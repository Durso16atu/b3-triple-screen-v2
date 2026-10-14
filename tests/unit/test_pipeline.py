import json
import os
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

import src.pipeline
from src.pipeline import CESTA_LIDER, fetch_market_data, main, process_pipeline


def test_fallback_generator_removed():
    """Confirma que _generate_fallback_history e BASE_PRICES_FALLBACK foram expurgados."""
    assert not hasattr(src.pipeline, "_generate_fallback_history")
    assert not hasattr(src.pipeline, "BASE_PRICES_FALLBACK")


@patch("yfinance.download")
def test_fetch_market_data_calls_yfinance_with_2y_and_auto_adjust(mock_download):
    """Verifica que o yfinance é acionado com period='2y' e auto_adjust=True."""
    dates = pd.date_range(end="2026-10-09", periods=100, freq="B")
    mock_df = pd.DataFrame(
        {
            "Open": np.full(100, 30.0),
            "High": np.full(100, 31.0),
            "Low": np.full(100, 29.0),
            "Close": np.full(100, 30.5),
            "Volume": np.full(100, 1000000.0),
        },
        index=dates,
    )

    download_df = pd.concat({f"{t}.SA": mock_df for t in CESTA_LIDER}, axis=1)
    mock_download.return_value = download_df

    res = fetch_market_data(["PETR4"])
    assert "PETR4" in res
    assert mock_download.called

    _, kwargs = mock_download.call_args
    assert kwargs.get("period") == "2y"
    assert kwargs.get("interval") == "1d"
    assert kwargs.get("auto_adjust") is True


@patch("yfinance.download")
def test_fetch_market_data_fail_fast_on_network_error(mock_download):
    """Verifica que falhas de rede no yfinance disparam RuntimeError (fail-fast)."""
    mock_download.side_effect = ConnectionError("Erro simulado de timeout/conexão")

    with pytest.raises(RuntimeError, match="Erro na ingestão de mercado via yfinance"):
        fetch_market_data(["PETR4"])


@patch("yfinance.download")
def test_fetch_market_data_fail_fast_on_empty_dataframe(mock_download):
    """Verifica que retorno vazio no yfinance dispara RuntimeError."""
    mock_download.return_value = pd.DataFrame()

    with pytest.raises(RuntimeError, match="DataFrame vazio"):
        fetch_market_data(["PETR4"])


def _create_mock_market_data() -> dict[str, pd.DataFrame]:
    dates = pd.date_range(end="2026-10-09", periods=250, freq="B")
    market_data = {}
    for i, t in enumerate(CESTA_LIDER):
        base = 20.0 + i * 5.0
        drift = np.linspace(0, 10, 250)
        close = base + drift
        high = close + 0.5
        low = close - 0.5
        market_data[t] = pd.DataFrame(
            {
                "Open": close - 0.1,
                "High": high,
                "Low": low,
                "Close": close,
                "Volume": np.full(250, 1000000.0),
            },
            index=dates,
        )
    return market_data


@patch("src.pipeline.fetch_market_data")
def test_process_pipeline_schema_validation_and_provenance(mock_fetch, tmp_path):
    """Valida o payload contra o schema JSON com procedência e níveis nulos aceitos."""
    mock_fetch.return_value = _create_mock_market_data()
    out_path = str(tmp_path / "test_latest.json")
    schema_path = "data/schemas/schema_v2.json"

    payload = process_pipeline(schema_path=schema_path, output_path=out_path)
    assert isinstance(payload, dict)

    assert os.path.exists(out_path)
    with open(out_path, encoding="utf-8") as f:
        data = json.load(f)
    assert payload == data

    # Metadados de procedência
    meta = data["metadata"]
    assert meta["data_source"] == "yfinance"
    assert meta["is_synthetic_fallback"] is False
    assert meta["ingestion_params"]["period"] == "2y"
    assert meta["ingestion_params"]["auto_adjust"] is True
    assert "session_date" in meta
    assert "generated_at" in meta
    assert "-03:00" in meta["generated_at"]

    # Rolagem de vencimento ativa
    active_mat = meta["active_maturity"]
    assert "maturity_date" in active_mat
    assert "call_series" in active_mat
    assert "put_series" in active_mat
    assert isinstance(active_mat["days_to_maturity_du"], int)

    # Subjacentes e níveis null
    assert len(data["underlyings"]) == 10
    for und in data["underlyings"]:
        if und["phase"] != "INDICACAO_IMEDIATA":
            assert und["gatilho_entrada"] is None
            assert und["stop_loss"] is None
            assert und["alvo_2r"] is None

    # Opções
    assert len(data["options"]) >= 30


@patch("src.pipeline.process_pipeline")
def test_main_entrypoint_fail_fast_exit(mock_process):
    """Verifica que o entrypoint main() chama sys.exit(1) em caso de falha."""
    mock_process.side_effect = RuntimeError("Falha simulada no pipeline")

    with pytest.raises(SystemExit) as exc_info:
        main([])
    assert exc_info.value.code == 1
