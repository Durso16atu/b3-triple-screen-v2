"""
Suíte de Testes Automatizados - Validação de Contrato v2.0 (Commit 2b3404e)
Projeto: b3-triple-screen-v2 (UFMG Finanças Atuariais)
"""

import json
import os
import unittest


class TestSchemaV2AndPipeline(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.schema_path = os.path.join(self.base_dir, "data", "schemas", "schema_v2.json")
        self.data_path = os.path.join(self.base_dir, "data", "latest.json")

    def test_arquivos_existem(self):
        """Valida a presença física de data/schemas/schema_v2.json e data/latest.json"""
        self.assertTrue(os.path.exists(self.schema_path), f"Schema ausente: {self.schema_path}")
        self.assertTrue(
            os.path.exists(self.data_path), f"Arquivo de dados ausente: {self.data_path}"
        )

    def test_contrato_json_e_raizes_obrigatorias(self):
        """Valida que data/latest.json atende às raízes obrigatórias do contrato v2.0"""
        with open(self.schema_path, encoding="utf-8") as f:
            schema = json.load(f)
        with open(self.data_path, encoding="utf-8") as f:
            data = json.load(f)

        required_roots = schema.get("required", ["metadata", "underlyings", "options"])
        for key in required_roots:
            self.assertIn(key, data, f"Chave obrigatória raiz ausente em latest.json: {key}")

    def test_metadados_pipeline(self):
        """Valida os campos de telemetria, governança e parâmetros do motor atuarial"""
        with open(self.data_path, encoding="utf-8") as f:
            data = json.load(f)
        meta = data.get("metadata", {})

        self.assertIn("schema_version", meta)
        self.assertIn("generated_at_utc", meta)
        self.assertIn("business_date", meta)
        self.assertIn("cdi_rate_annual", meta)
        self.assertIn("workdays_per_year", meta)
        self.assertEqual(meta.get("workdays_per_year"), 252)
        self.assertGreater(meta.get("cdi_rate_annual", 0), 0)

    def test_underlyings_trend_signal_tela_1(self):
        """Valida os ativos subjacentes e o sinal de tendência do Triple Screen (Tela 1)"""
        with open(self.data_path, encoding="utf-8") as f:
            data = json.load(f)
        underlyings = data.get("underlyings", [])
        self.assertIsInstance(underlyings, list)
        self.assertGreaterEqual(len(underlyings), 1, "Deve conter pelo menos 1 ativo subjacente")

        ativo = underlyings[0]
        self.assertIn("ticker", ativo)
        self.assertIn("spot_price", ativo)
        self.assertIn("trend_signal", ativo)
        self.assertGreater(ativo["spot_price"], 0)
        self.assertIn(
            ativo["trend_signal"].upper(), ["ALTA", "BAIXA", "NEUTRA", "BULLISH", "BEARISH"]
        )

    def test_options_grade_b3_e_gregas(self):
        """Valida a grade de opções B3, precificação Black-Scholes e gregas atuariais"""
        with open(self.data_path, encoding="utf-8") as f:
            data = json.load(f)
        options = data.get("options", [])
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

    def test_actuarial_checks_quality_gate(self):
        """Valida os quality gates atuariais (limites intrínsecos de prêmio na B3)"""
        with open(self.data_path, encoding="utf-8") as f:
            data = json.load(f)
        options = data.get("options", [])

        for opt in options:
            checks = opt.get("actuarial_checks", {})
            self.assertIn("intrinsic_bound_ok", checks)
            self.assertTrue(
                checks["intrinsic_bound_ok"], f"Quality gate violado para {opt.get('symbol')}"
            )


if __name__ == "__main__":
    unittest.main()
