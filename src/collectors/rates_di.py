import logging

import requests

logger = logging.getLogger(__name__)


def get_annual_cdi_rate(fallback_rate: float = 0.1050, timeout: int = 5) -> float:
    url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json"
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        if data and isinstance(data, list) and len(data) > 0:
            rate_pct = float(data[0]["valor"])
            return rate_pct / 100.0
    except Exception as e:
        logger.warning(
            f"Falha ao obter taxa CDI da API do BCB: {e}. Usando fallback: {fallback_rate}"
        )

    return fallback_rate
