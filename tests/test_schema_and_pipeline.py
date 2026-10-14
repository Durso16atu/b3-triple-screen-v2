"""Suíte de Testes Automatizados - Validação de Contrato v2.0.

Projeto: b3-triple-screen-v2 (UFMG Finanças Atuariais)
"""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import jsonschema
import numpy as np
import pandas as pd

from src.pipeline import CESTA_LIDER, process_pipeline


class TestSchemaV2AndPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = Path(__file__).resolve().parent.parent
        cls.schema_path = str(cls.base_dir / "data" / "schemas" / "schema_v2.json")
        cls.data_path = str(cls.base_dir / "data" / "latest.json")

        with open(cls.schema_path, encoding="utf-8") as f:
            cls.schema = json.load(f)

        with open(cls.data_path, encoding="utf-8") as f:
            cls.data = json.load(f)

    def test_arquivos_existem(self):
        """Valida a presença física de data/schemas/schema_v2.json e data/latest.json."""
        self.assertTrue(os.path.exists(self.schema_path), f"Schema ausente: {self.schema_path}")
        self.assertTrue(
            os.path.exists(self.data_path), f"Arquivo de dados ausente: {self.data_path}"
        )

    def test_contrato_json_e_raizes_obrigatorias(self):
        """Valida que data/latest.json atende às raízes obrigatórias e ao schema v2.0 estrito."""
        # Validação estrita do schema JSON v2
        jsonschema.validate(instance=self.data, schema=self.schema)

        required_roots = self.schema.get("required", ["metadata", "underlyings", "options"])
        for key in required_roots:
            self.assertIn(key, self.data, f"Chave obrigatória raiz ausente em latest.json: {key}")

    def test_metadados_pipeline(self):
        """Valida campos de telemetria, governança, procedência e parâmetros atuariais."""
        meta = self.data.get("metadata", {})

        self.assertIn("schema_version", meta)
        self.assertIn("generated_at_utc", meta)
        self.assertIn("generated_at", meta)
        self.assertIn("session_date", meta)
        self.assertIn("business_date", meta)
        self.assertIn("cdi_rate_annual", meta)
        self.assertIn("workdays_per_year", meta)
        self.assertEqual(meta.get("workdays_per_year"), 252)
        self.assertGreater(meta.get("cdi_rate_annual", 0), 0)

        # Metadados de procedência e governança v2
        self.assertEqual(meta.get("data_source"), "yfinance")
        self.assertIs(meta.get("is_synthetic_fallback"), False)
        ingestion = meta.get("ingestion_params", {})
        self.assertEqual(ingestion.get("period"), "2y")
        self.assertEqual(ingestion.get("interval"), "1d")
        self.assertTrue(ingestion.get("auto_adjust"))

        # Rolagem e série ativa B3
        active_mat = meta.get("active_maturity", {})
        self.assertIn("maturity_date", active_mat)
        self.assertGreaterEqual(active_mat.get("days_to_maturity_du", -1), 0)
        self.assertIn(active_mat.get("call_series"), "ABCDEFGHIJKL")
        self.assertIn(active_mat.get("put_series"), "MNOPQRSTUVWX")
        self.assertIsInstance(active_mat.get("rolled"), bool)

    def test_underlyings_trend_signal_tela_1(self):
        """Valida os ativos subjacentes, sinal de tendência e níveis condicionais (Tela 1/2/3)."""
        underlyings = self.data.get("underlyings", [])
        self.assertIsInstance(underlyings, list)
        self.assertGreaterEqual(
            len(underlyings), 10, "Deve conter pelo menos 10 ativos subjacentes homologados"
        )

        for ativo in underlyings:
            self.assertIn("ticker", ativo)
            self.assertIn("spot_price", ativo)
            self.assertIn("trend_signal", ativo)
            self.assertGreater(ativo["spot_price"], 0)
            self.assertIn(
                ativo["trend_signal"].upper(),
                ["ALTA", "BAIXA", "NEUTRA", "NEUTRO", "BULLISH", "BEARISH"],
            )

            # Ativos não-armados devem possuir níveis nulos (não valores espúrios)
            for field in ["gatilho_entrada", "stop_loss", "alvo_2r"]:
                val = ativo.get(field)
                self.assertTrue(
                    val is None or (isinstance(val, int | float) and val >= 0),
                    f"{field} inválido para {ativo['ticker']}: {val}",
                )

            # Indicadores reais da Tela 2
            self.assertIn("stoch_k", ativo)
            self.assertIn("stoch_d", ativo)
            self.assertIn("force_ema2", ativo)
            self.assertIn("wave_daily", ativo)

            if ativo["stoch_k"] is not None:
                self.assertGreaterEqual(ativo["stoch_k"], 0.0)
                self.assertLessEqual(ativo["stoch_k"], 100.0)
            if ativo["stoch_d"] is not None:
                self.assertGreaterEqual(ativo["stoch_d"], 0.0)
                self.assertLessEqual(ativo["stoch_d"], 100.0)
            self.assertIn(ativo["wave_daily"], ["SOBREVENDA", "SOBRECOMPRA", "NEUTRO"])

    def test_options_grade_b3_e_gregas(self):
        """Valida a grade de opções B3, precificação Black-Scholes e gregas atuariais."""
        options = self.data.get("options", [])
        self.assertIsInstance(options, list)
        self.assertGreaterEqual(len(options), 1, "Deve conter pelo menos 1 opção na grade")

        for opt in options:
            self.assertIn("symbol", opt)
            self.assertIn("underlying_ticker", opt)
            self.assertIn("type", opt)
            self.assertIn("strike", opt)
            self.assertIn("du", opt)
            self.assertIn("maturity_date", opt)
            self.assertIn("theoretical_price", opt)
            self.assertIn("greeks", opt)

            self.assertGreater(opt["strike"], 0)
            self.assertGreaterEqual(opt["du"], 0)
            self.assertGreater(opt["theoretical_price"], 0)

            greeks = opt["greeks"]
            self.assertIn("delta", greeks)
            self.assertIn("gamma", greeks)
            self.assertIn("theta_du", greeks)
            self.assertIn("vega", greeks)
            self.assertGreaterEqual(greeks["delta"], 0)
            self.assertGreaterEqual(greeks["gamma"], 0)
            self.assertLessEqual(greeks["theta_du"], 0)
            self.assertGreaterEqual(greeks["vega"], 0)

    def test_actuarial_checks_quality_gate(self):
        """Valida os quality gates atuariais (limites intrínsecos de prêmio na B3)."""
        options = self.data.get("options", [])

        for opt in options:
            checks = opt.get("actuarial_checks", {})
            self.assertIn("intrinsic_bound_ok", checks)
            self.assertTrue(
                checks["intrinsic_bound_ok"], f"Quality gate violado para {opt.get('symbol')}"
            )
            self.assertLess(checks.get("parity_violation_brl", 0.0), 1e-3)

    @patch("src.pipeline.fetch_market_data")
    def test_deterministic_offline_pipeline_execution(self, mock_fetch):
        """Valida execução determinística do pipeline sem rede com validação estrita do schema."""
        dates = pd.date_range(end="2026-10-09", periods=100, freq="B")
        mock_data = {}
        for i, ticker in enumerate(CESTA_LIDER):
            base = 20.0 + i * 5.0
            close = base + np.linspace(0, 5, 100)
            mock_data[ticker] = pd.DataFrame(
                {
                    "Open": close - 0.1,
                    "High": close + 0.5,
                    "Low": close - 0.5,
                    "Close": close,
                    "Volume": np.full(100, 1000000.0),
                },
                index=dates,
            )
        mock_fetch.return_value = mock_data

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "latest_deterministic.json")
            payload = process_pipeline(
                schema_path=self.schema_path,
                output_path=out_path,
                cdi_rate=0.105,
            )

            # Valida estritamente contra o schema v2
            jsonschema.validate(instance=payload, schema=self.schema)
            self.assertTrue(os.path.exists(out_path))
            self.assertEqual(payload["metadata"]["data_source"], "yfinance")
            self.assertFalse(payload["metadata"]["is_synthetic_fallback"])
            self.assertEqual(len(payload["underlyings"]), len(CESTA_LIDER))
            self.assertGreaterEqual(len(payload["options"]), 10)


if __name__ == "__main__":
    unittest.main()
