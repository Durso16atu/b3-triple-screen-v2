"""Coletor da Grade Oficial B3 via Opções.Net.Br com cache diário e controle de rate-limit."""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

OPCOES_NET_URL = "https://opcoes.net.br/listaopcoes/completa"
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_CACHE_PATH = ROOT_DIR / "data" / "temp" / "opcoes_net_cache.json"

# Mapeamento reverso caso algum ticker tenha mudado código na B3
TICKER_OPCOES_ALIASES: dict[str, list[str]] = {
    "ELET3": ["ELET3", "AXIA3"],
    "NTCO3": ["NTCO3", "NATU3"],
    "JBSS3": ["JBSS3", "JBSS32"],
}


@dataclass(frozen=True)
class ListedOptionQuote:
    """Representa uma série real de opção listada na B3 extraída do Opções.Net.Br."""

    symbol: str
    underlying_ticker: str
    opt_type: str
    style: str
    has_market_maker: bool
    strike: float
    dist_strike_pct: float
    ref_spot_price: float
    last_price: float
    num_trades: int
    financial_volume: float
    quote_date: str
    maturity_date: str
    ref_du: int


def _load_daily_cache(cache_path: Path, session_key: str) -> dict[str, list[dict[str, Any]]]:
    """Carrega o cache diário em disco (dentro de data/temp/) se pertencer à data atual."""
    if not cache_path.exists():
        return {}
    try:
        with open(cache_path, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict) and payload.get("session_key") == session_key:
            entries = payload.get("entries", {})
            if isinstance(entries, dict):
                return entries
    except Exception as exc:
        logger.debug(f"Cache de opções ignorado ({exc}).")
    return {}


def _save_daily_cache(
    cache_path: Path, session_key: str, entries: dict[str, list[dict[str, Any]]]
) -> None:
    """Salva atomicamente o cache diário da grade B3 em data/temp/."""
    try:
        os.makedirs(cache_path.parent, exist_ok=True)
        tmp_path = cache_path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump({"session_key": session_key, "entries": entries}, f, indent=2)
        os.replace(tmp_path, cache_path)
    except Exception as exc:
        logger.debug(f"Não foi possível persistir cache de opções: {exc}")


def select_representative_liquid_calls(
    quotes: list[ListedOptionQuote],
    spot: float,
    min_moneyness: float = -0.10,
    max_moneyness: float = 0.12,
    target_buckets: int = 8,
) -> list[ListedOptionQuote]:
    """Seleciona Calls reais B3: 1) Pool Estrutural ITM/ATM e 2) Pool F. Góes (R$ 0,10 a 0,30)."""
    if not quotes or spot <= 0:
        return []

    all_calls = [q for q in quotes if q.opt_type == "CALL" and q.last_price > 0.01 and q.strike > 0]
    if not all_calls:
        return []

    selected_by_symbol: dict[str, ListedOptionQuote] = {}

    # 1. Pool Estrutural Triple Screen (ITM / ATM / OTM próximo para Trava de Alta: -10% a +12%)
    structural_valid = [
        q for q in all_calls if min_moneyness <= (q.strike - spot) / spot <= max_moneyness
    ]
    structural_liquid = [q for q in structural_valid if q.num_trades >= 3]
    structural_pool = structural_liquid if len(structural_liquid) >= 4 else structural_valid

    if len(structural_pool) <= target_buckets:
        for q in structural_pool:
            selected_by_symbol[q.symbol] = q
    else:
        step = (max_moneyness - min_moneyness) / target_buckets
        for b_idx in range(target_buckets):
            low_m = min_moneyness + b_idx * step
            high_m = low_m + step
            upper_bound = high_m if b_idx < target_buckets - 1 else high_m + 0.01
            bucket_candidates = [
                q for q in structural_pool if low_m <= (q.strike - spot) / spot < upper_bound
            ]
            if not bucket_candidates:
                continue
            best = max(
                bucket_candidates,
                key=lambda q: (
                    1 if q.has_market_maker else 0,
                    q.num_trades,
                    q.financial_volume,
                ),
            )
            selected_by_symbol[best.symbol] = best

    # 2. Pool Tiro Curto Fernando Góes (OTM de centavos: R$ 0,08 a R$ 0,38 / alvo 0,10 a 0,30)
    goes_candidates = [
        q for q in all_calls if q.strike > spot * 1.02 and 0.08 <= q.last_price <= 0.38
    ]
    goes_liquid = [q for q in goes_candidates if q.num_trades >= 3]
    goes_pool = goes_liquid if len(goes_liquid) >= 2 else goes_candidates

    # Sub-faixas de centavos F. Góes: [0.26..0.38], [0.19..0.26), [0.13..0.19), [0.08..0.13)
    cent_bands = [(0.26, 0.39), (0.19, 0.26), (0.13, 0.19), (0.08, 0.13)]
    for p_low, p_high in cent_bands:
        band_items = [q for q in goes_pool if p_low <= q.last_price < p_high]
        if not band_items:
            continue
        best_goes = max(
            band_items,
            key=lambda q: (
                q.num_trades,
                q.financial_volume,
                1 if q.has_market_maker else 0,
            ),
        )
        selected_by_symbol[best_goes.symbol] = best_goes

    return sorted(selected_by_symbol.values(), key=lambda x: x.strike)


def _parse_opcoes_net_payload(
    data: dict[str, Any],
    underlying_ticker: str,
    target_maturity: str,
    default_du: int,
    spot_fallback: float,
) -> list[ListedOptionQuote]:
    """Converte o JSON bruto de cotacoesOpcoes do Opções.Net.Br em objetos tipados."""
    ref_du = default_du
    for venc in data.get("vencimentos") or []:
        if isinstance(venc, dict) and venc.get("value") == target_maturity:
            du_str = (venc.get("dataAttributes") or {}).get("du")
            if du_str and str(du_str).isdigit():
                ref_du = max(1, int(du_str))
            break

    rows = data.get("cotacoesOpcoes") or []
    quotes: list[ListedOptionQuote] = []

    for row in rows:
        if not isinstance(row, list) or len(row) < 12:
            continue
        raw_sym = str(row[0] or "").strip()
        opt_type = str(row[2] or "").strip().upper()
        if not raw_sym or opt_type != "CALL":
            continue

        strike_raw = row[5]
        last_price_raw = row[8]
        if strike_raw is None or last_price_raw is None:
            continue

        try:
            strike = float(strike_raw)
            last_price = float(last_price_raw)
        except (TypeError, ValueError):
            continue

        if strike <= 0 or last_price <= 0:
            continue

        dist_pct = 0.0
        try:
            if row[6] is not None:
                dist_pct = float(row[6])
        except (TypeError, ValueError):
            dist_pct = 0.0

        ref_spot = (
            round(strike / (1.0 + dist_pct), 2)
            if abs(1.0 + dist_pct) > 1e-4 and dist_pct != 0.0
            else spot_fallback
        )

        num_trades = 0
        try:
            if row[9] is not None:
                num_trades = int(row[9])
        except (TypeError, ValueError):
            num_trades = 0

        fin_vol = 0.0
        try:
            if row[10] is not None:
                fin_vol = float(row[10])
        except (TypeError, ValueError):
            fin_vol = 0.0

        symbol = raw_sym.split("_")[0]
        mod_raw = str(row[3] or "E").strip().upper()
        style = "AMERICAN" if mod_raw == "A" else "EUROPEAN"
        has_mm = bool(str(row[1] or "").strip())
        quote_date = str(row[11] or "")[:10]

        quotes.append(
            ListedOptionQuote(
                symbol=symbol,
                underlying_ticker=underlying_ticker,
                opt_type="CALL",
                style=style,
                has_market_maker=has_mm,
                strike=round(strike, 2),
                dist_strike_pct=round(dist_pct, 4),
                ref_spot_price=float(ref_spot),
                last_price=round(last_price, 2),
                num_trades=max(0, num_trades),
                financial_volume=round(max(0.0, fin_vol), 2),
                quote_date=quote_date,
                maturity_date=target_maturity,
                ref_du=ref_du,
            )
        )

    return quotes


def fetch_b3_real_options_batch(
    tickers_spot: dict[str, float],
    maturity_date: date | str,
    default_du: int,
    session_date: date | str | None = None,
    cache_path: Path = DEFAULT_CACHE_PATH,
    request_delay_sec: float = 0.72,
    timeout: int = 8,
) -> dict[str, list[ListedOptionQuote]]:
    """Coleta a grade oficial B3 no Opções.Net.Br para a cesta de ativos com cache e backoff."""
    mat_str = maturity_date.isoformat() if isinstance(maturity_date, date) else str(maturity_date)
    sess_str = (
        session_date.isoformat()
        if isinstance(session_date, date)
        else str(session_date or date.today().isoformat())
    )
    session_key = f"{sess_str}:{mat_str}"

    cached_entries = _load_daily_cache(cache_path, session_key)
    result: dict[str, list[ListedOptionQuote]] = {}

    http = requests.Session()
    http.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0",
            "Accept": "application/json",
        }
    )

    cache_dirty = False
    for ticker, spot in tickers_spot.items():
        if ticker in cached_entries and cached_entries[ticker]:
            try:
                restored = [ListedOptionQuote(**item) for item in cached_entries[ticker]]
                result[ticker] = select_representative_liquid_calls(restored, spot)
                continue
            except Exception:
                pass

        aliases = TICKER_OPCOES_ALIASES.get(ticker, [ticker])
        fetched_quotes: list[ListedOptionQuote] = []

        for alias in aliases:
            for attempt in range(3):
                try:
                    resp = http.get(
                        OPCOES_NET_URL,
                        params={
                            "idAcao": alias,
                            "listarVencimentos": "true",
                            "cotacoes": "true",
                            "vencimentos": mat_str,
                        },
                        timeout=timeout,
                    )
                    if resp.status_code == 200:
                        payload_json = resp.json()
                        data_node = payload_json.get("data") or {}
                        fetched_quotes = _parse_opcoes_net_payload(
                            data_node,
                            underlying_ticker=ticker,
                            target_maturity=mat_str,
                            default_du=default_du,
                            spot_fallback=spot,
                        )
                        break
                    if resp.status_code == 429:
                        time.sleep(2.1 * (attempt + 1))
                        continue
                    break
                except Exception as exc:
                    logger.debug(f"Aviso ao consultar Opções.Net.Br para {alias}: {exc}")
                    break

            if request_delay_sec > 0:
                time.sleep(request_delay_sec)

            if fetched_quotes:
                break

        if fetched_quotes:
            curated = select_representative_liquid_calls(fetched_quotes, spot)
            result[ticker] = curated
            cached_entries[ticker] = [asdict(q) for q in fetched_quotes]
            cache_dirty = True
        else:
            result[ticker] = []

    if cache_dirty:
        _save_daily_cache(cache_path, session_key, cached_entries)

    return result
