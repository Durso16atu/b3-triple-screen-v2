# ruff: noqa: E501, E402
"""Interface de linha de comando para gerar o briefing de IA do B3 Triple Screen v2."""

import argparse
import logging
import sys
from pathlib import Path

# Ajustar PYTHONPATH se necessário
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ai.providers.gemini import GeminiProvider
from src.ai.providers.omniroute import OmniRouteProvider
from src.ai.synthesizer import MarketSynthesizer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ai_briefing")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera briefing executivo do mercado B3 via IA.")
    parser.add_argument(
        "--snapshot",
        type=str,
        default=str(ROOT_DIR / "data" / "latest.json"),
        help="Caminho do snapshot JSON (default: data/latest.json)",
    )
    parser.add_argument(
        "--provider",
        choices=["gemini", "omniroute", "auto"],
        default="auto",
        help="Provedor de LLM a utilizar (default: auto)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Nome do modelo a ser utilizado pelo provedor (opcional)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Caminho opcional para salvar o briefing em JSON (ex: data/briefing_latest.json)",
    )
    args = parser.parse_args()

    provider = None
    if args.provider == "gemini":
        provider = GeminiProvider(model=args.model or "gemini-flash-latest")
    elif args.provider == "omniroute":
        provider = OmniRouteProvider(model=args.model or "gemini-3.1-flash-lite")

    synthesizer = MarketSynthesizer(provider=provider)
    logger.info("Iniciando síntese via provedor: %s", synthesizer.provider.provider_name)

    try:
        briefing = synthesizer.synthesize_from_file(args.snapshot)
        result_json = briefing.model_dump_json(indent=2)
        print("\n" + "=" * 60)
        print(" BRIEFING EXECUTIVO B3 TRIPLE SCREEN v2.0")
        print("=" * 60)
        print(
            f"Sessão: {briefing.overview.session_date} | CDI: {briefing.overview.cdi_rate_annual * 100:.2f}% a.a. | DU: {briefing.overview.days_to_maturity_du}"
        )
        print(f"Sentimento de Mercado: {briefing.overview.market_sentiment}")
        print("\nDestaques:")
        for t in briefing.highlighted_tickers:
            print(
                f"- [{t.ticker}] Spot: R$ {t.spot_price:.2f} | Tendência: {t.trend} | Fase: {t.phase} | Estocástico: {t.stoch_k:.1f}"
            )
            print(f"  Diagnóstico: {t.assessment}")
            if t.hedging_suggestion:
                print(f"  Hedge/Opções: {t.hedging_suggestion}")

        print("\nRecomendações Disciplinares:")
        for r in briefing.actionable_recommendations:
            print(f"• {r}")
        print("=" * 60 + "\n")

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(result_json)
            logger.info("Briefing salvo com sucesso em: %s", out_path)

        return 0
    except Exception as e:
        logger.error("Falha ao gerar briefing executivo: %s", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
