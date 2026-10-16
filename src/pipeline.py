"""Pipeline atuarial e quantitativo do B3 Triple Screen v2.0."""

import argparse
import hashlib
import json
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import jsonschema
import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.collectors.rates_di import get_annual_cdi_rate  # noqa: E402
from src.engine.black_scholes import BlackScholesEngine  # noqa: E402
from src.engine.calendar_anbima import get_active_maturity  # noqa: E402
from src.engine.screening import TripleScreenFilter  # noqa: E402

logger = logging.getLogger(__name__)

SP_TZ = ZoneInfo("America/Sao_Paulo")

CESTA_LIDER = [
    # Top 5 Principais
    "PETR4",
    "VALE3",
    "ITUB4",
    "BBDC4",
    "BBAS3",
    # Setor Financeiro e Holding (Alta Liquidez)
    "B3SA3",
    "ITSA4",
    "BBSE3",
    "SANB11",
    "BPAC11",
    # Commodities, Energia e Siderurgia
    "PETR3",
    "PRIO3",
    "GGBR4",
    "CSNA3",
    "USIM5",
    "SUZB3",
    "ELET3",
    "CMIG4",
    # Consumo, Varejo e Logística
    "ABEV3",
    "MGLU3",
    "LREN3",
    "NTCO3",
    "RAIZ4",
    "RENT3",
    "VAMO3",
    "JBSS3",
    # Benchmarks Adicionais de Alta Liquidez
    "BOVA11",
    "WEGE3",
]

# Mapeamento de tickers que passaram por reorganização societária/renomeação no yfinance
TICKER_YFINANCE_MAP = {
    "ELET3": "AXIA3.SA",  # Eletrobras renomeada para Axia Energia (AXIA3)
    "NTCO3": "NATU3.SA",  # Natura Cosméticos retornou ao ticker histórico NATU3
    "JBSS3": "JBSS32.SA",  # JBS N.V. negociada via BDRs JBSS32 na B3
}


def fetch_market_data(tickers: list[str]) -> dict[str, pd.DataFrame]:
    """Obtém cotações diárias reais via yfinance com fail-fast estrito."""
    try:
        import yfinance as yf

        yf_syms = [TICKER_YFINANCE_MAP.get(t, f"{t}.SA") for t in tickers]
        sym_to_ticker = {TICKER_YFINANCE_MAP.get(t, f"{t}.SA"): t for t in tickers}

        df_download = yf.download(
            yf_syms,
            period="2y",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            timeout=35,
            progress=False,
        )
    except Exception as e:
        logger.critical(f"Falha crítica na rede/download via yfinance: {e}")
        raise RuntimeError(f"Erro na ingestão de mercado via yfinance: {e}") from e

    if df_download is None or df_download.empty:
        logger.critical("Download via yfinance retornou DataFrame vazio.")
        raise RuntimeError("yfinance retornou DataFrame vazio para a cesta líder.")

    data_dict: dict[str, pd.DataFrame] = {}
    for yf_sym, t in sym_to_ticker.items():
        if len(yf_syms) == 1:
            df_t = df_download.dropna()
            if len(df_t) >= 60:
                data_dict[t] = df_t
        elif yf_sym in df_download and not df_download[yf_sym].dropna().empty:
            df_t = df_download[yf_sym].dropna()
            if len(df_t) >= 60:
                data_dict[t] = df_t
        elif f"{t}.SA" in df_download and not df_download[f"{t}.SA"].dropna().empty:
            df_t = df_download[f"{t}.SA"].dropna()
            if len(df_t) >= 60:
                data_dict[t] = df_t

    missing = [t for t in tickers if t not in data_dict or data_dict[t].empty]
    if missing:
        msg = f"Dados insuficientes para os ativos da cesta líder: {missing}"
        logger.critical(msg)
        raise RuntimeError(msg)

    return data_dict


def process_pipeline(
    schema_path: str,
    output_path: str,
    mock_data: dict | None = None,
    cdi_rate: float | None = None,
) -> dict:
    """Executa o pipeline atuarial com ingestão real, Triple Screen e não-arbitragem."""
    now_sp = datetime.now(SP_TZ)
    now_utc = datetime.now(UTC).isoformat()
    generated_at_sp = now_sp.isoformat()
    session_date = now_sp.date()

    if cdi_rate is None:
        try:
            cdi_rate = get_annual_cdi_rate()
        except Exception:
            cdi_rate = 0.1075

    active_mat = get_active_maturity(session_date, min_du=5)
    maturity_date = active_mat["maturity_date"]
    du = active_mat["days_to_maturity_du"]
    call_series = active_mat["call_series"]
    put_series = active_mat["put_series"]

    if mock_data is not None:
        underlyings_raw = mock_data.get("underlyings", [])
        options_raw = mock_data.get("options", [])
    else:
        market_data = fetch_market_data(CESTA_LIDER)
        ts_filter = TripleScreenFilter(tick_size=0.01)

        underlyings_raw = []
        options_raw = []

        for ticker in CESTA_LIDER:
            df = market_data[ticker]
            spot = round(float(df["Close"].iloc[-1]), 2)
            screening = ts_filter.evaluate(ticker, df, session_date=session_date)

            if screening is not None:
                trend = screening.trend_weekly
                if screening.signal_status == "ARMADO":
                    phase = "INDICACAO_IMEDIATA"
                    gatilho = screening.trigger_buy_stop
                    stop = screening.stop_loss
                    alvo = screening.target_2r
                elif trend == "ALTA":
                    phase = "A_CAMINHO"
                    gatilho = None
                    stop = None
                    alvo = None
                else:
                    phase = "AGUARDANDO"
                    gatilho = None
                    stop = None
                    alvo = None

                stoch_k = (
                    round(max(0.0, min(100.0, float(screening.stoch_k))), 2)
                    if screening.stoch_k is not None and not np.isnan(screening.stoch_k)
                    else None
                )
                stoch_d = (
                    round(max(0.0, min(100.0, float(screening.stoch_d))), 2)
                    if screening.stoch_d is not None and not np.isnan(screening.stoch_d)
                    else None
                )
                force_ema2 = (
                    round(float(screening.force_index_ema2), 2)
                    if (
                        screening.force_index_ema2 is not None
                        and not np.isnan(screening.force_index_ema2)
                    )
                    else None
                )
                wave_daily = (
                    str(screening.wave_daily) if screening.wave_daily is not None else "NEUTRO"
                )
            else:
                trend = "NEUTRO"
                phase = "AGUARDANDO"
                gatilho = None
                stop = None
                alvo = None
                stoch_k = None
                stoch_d = None
                force_ema2 = None
                wave_daily = "NEUTRO"

            recent_low_14 = float(df["Low"].rolling(min(14, len(df))).min().iloc[-1])
            suporte_fibo = round(recent_low_14, 2)

            ema13_series = df["Close"].ewm(span=13, adjust=False).mean()
            df_tail = df.iloc[-60:]
            ema_tail = ema13_series.iloc[-60:]
            ohlc_history = []
            for (idx, row), ema_val in zip(df_tail.iterrows(), ema_tail, strict=False):
                dt_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                ohlc_history.append(
                    {
                        "date": dt_str,
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "ema13": round(float(ema_val), 2) if not np.isnan(ema_val) else None,
                    }
                )

            underlyings_raw.append(
                {
                    "ticker": str(ticker),
                    "spot_price": float(spot),
                    "trend_signal": str(trend),
                    "phase": str(phase),
                    "suporte_fibonacci": float(suporte_fibo),
                    "gatilho_entrada": gatilho,
                    "stop_loss": stop,
                    "alvo_2r": alvo,
                    "stoch_k": stoch_k,
                    "stoch_d": stoch_d,
                    "force_ema2": force_ema2,
                    "wave_daily": wave_daily,
                    "ohlc_history": ohlc_history,
                    "updated_at": generated_at_sp,
                }
            )

            # Volatilidade histórica para precificação das opções
            returns = np.log(df["Close"] / df["Close"].shift(1)).dropna()
            hist_vol = float(returns.std() * np.sqrt(252)) if len(returns) >= 20 else 0.28
            hist_vol = max(0.15, min(0.75, hist_vol))

            ticker_options = BlackScholesEngine.build_option_chain(
                ticker=ticker,
                spot=spot,
                du=du,
                cdi_rate=cdi_rate,
                vol=hist_vol,
                maturity_date=maturity_date,
                call_series=call_series,
                put_series=put_series,
            )
            options_raw.extend(ticker_options)

    payload = {
        "metadata": {
            "schema_version": "2.0.0",
            "generated_at_utc": now_utc,
            "generated_at": generated_at_sp,
            "session_date": session_date.isoformat(),
            "business_date": session_date.isoformat(),
            "data_source": "yfinance",
            "ingestion_params": {
                "period": "2y",
                "interval": "1d",
                "auto_adjust": True,
            },
            "is_synthetic_fallback": False,
            "cdi_rate_annual": cdi_rate,
            "workdays_per_year": 252,
            "engine_version": "2.0.0",
            "checksum": "",
            "active_maturity": {
                "maturity_date": maturity_date.isoformat(),
                "days_to_maturity_du": int(du),
                "call_series": call_series,
                "put_series": put_series,
                "rolled": bool(active_mat["rolled"]),
            },
        },
        "underlyings": underlyings_raw,
        "options": options_raw,
    }

    checksum_str = json.dumps(payload, sort_keys=True)
    payload["metadata"]["checksum"] = hashlib.sha256(checksum_str.encode()).hexdigest()

    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)
    jsonschema.validate(instance=payload, schema=schema)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_path = output_path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    os.replace(temp_path, output_path)

    return payload


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/latest.json", help="Output JSON path")
    parser.add_argument("--schema", default="data/schemas/schema_v2.json", help="Schema path")
    args = parser.parse_args(argv)

    try:
        process_pipeline(schema_path=args.schema, output_path=args.output)
    except Exception as e:
        logger.critical(f"Falha na execução do pipeline: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
