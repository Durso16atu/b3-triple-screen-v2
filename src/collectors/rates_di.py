import json
import logging
import os
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_CDI_CACHE_PATH = ROOT_DIR / "data" / "temp" / "cdi_rate_cache.json"
DEFAULT_SNAPSHOT_PATH = ROOT_DIR / "data" / "latest.json"


def _load_cached_cdi_rate(cache_path: Path, snapshot_path: Path | None = None) -> float | None:
    for candidate in (cache_path, snapshot_path):
        if candidate is None or not candidate.exists():
            continue
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
            rate = payload.get("cdi_rate_annual")
            if rate is None and isinstance(payload.get("metadata"), dict):
                rate = payload["metadata"].get("cdi_rate_annual")
            if isinstance(rate, int | float) and 0.01 <= float(rate) <= 0.50:
                return float(rate)
        except Exception:
            continue
    return None


def _save_cached_cdi_rate(cache_path: Path, rate: float) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(
            json.dumps({"cdi_rate_annual": round(float(rate), 6)}),
            encoding="utf-8",
        )
    except Exception:
        pass


def get_annual_cdi_rate(
    fallback_rate: float = 0.1050,
    timeout: int = 5,
    cache_path: Path | None = None,
) -> float:
    url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json"
    use_default_cache = cache_path is not None or not os.environ.get("PYTEST_CURRENT_TEST")
    resolved_cache = cache_path or DEFAULT_CDI_CACHE_PATH
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        if data and isinstance(data, list) and len(data) > 0:
            rate_pct = float(data[0]["valor"])
            rate_dec = rate_pct / 100.0
            if use_default_cache:
                _save_cached_cdi_rate(resolved_cache, rate_dec)
            return rate_dec
    except Exception as e:
        if use_default_cache:
            cached = _load_cached_cdi_rate(
                resolved_cache,
                DEFAULT_SNAPSHOT_PATH if cache_path is None else None,
            )
            if cached is not None:
                logger.warning(
                    f"Falha ao obter CDI no BCB ({e}). Usando último CDI em cache: {cached}"
                )
                return cached
        logger.warning(
            f"Falha ao obter taxa CDI da API do BCB: {e}. Usando fallback: {fallback_rate}"
        )

    return fallback_rate
