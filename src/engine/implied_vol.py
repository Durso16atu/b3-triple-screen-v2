"""Cálculo de Volatilidade Implícita (Brent-Dekker) e Estimador Reativo de Volatilidade Curta."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.optimize import brentq

from src.engine.black_scholes import black_scholes_analytical


def get_implied_volatility(
    market_price: float,
    S: float,
    K: float,
    du: int,
    cdi_anual: float,
    is_call: bool,
    q: float = 0.0,
) -> float | None:
    """Extrai a Volatilidade Implícita exata via método numérico de Brent-Dekker."""
    if du <= 0:
        return None

    intrinsic = max(0.0, S - K) if is_call else max(0.0, K - S)
    if market_price < intrinsic:
        return None

    def objective(vol: float) -> float:
        res = black_scholes_analytical(S, K, du, cdi_anual, vol, is_call, q)
        return res.price - market_price

    try:
        iv = brentq(objective, 0.001, 5.0)
        return float(iv)
    except (ValueError, RuntimeError):
        return None


def estimate_reactive_volatility(df: pd.DataFrame, default_vol: float = 0.28) -> float:
    """Estima volatilidade reativa curta (EWMA + Parkinson 21d + Choque 10d) como proxy IV."""
    if df is None or len(df) < 20 or "Close" not in df:
        return default_vol

    close = df["Close"].astype(float)
    returns = np.log(close / close.shift(1)).dropna()
    if len(returns) < 15:
        return default_vol

    vol_long = float(returns.std() * math.sqrt(252.0))
    vol_21 = float(returns.iloc[-21:].std() * math.sqrt(252.0))
    vol_10 = float(returns.iloc[-10:].std() * math.sqrt(252.0))
    vol_ewma = float(returns.ewm(alpha=0.06, adjust=False).std().iloc[-1] * math.sqrt(252.0))

    vol_parkinson = vol_21
    if "High" in df and "Low" in df:
        high = df["High"].astype(float).iloc[-21:]
        low = df["Low"].astype(float).iloc[-21:]
        valid_hl = (high > 0) & (low > 0) & (high >= low)
        if valid_hl.any():
            hl_ratio = np.log(high[valid_hl] / low[valid_hl]) ** 2
            park_var = float(hl_ratio.mean()) / (4.0 * math.log(2.0))
            vol_parkinson = math.sqrt(max(0.0, park_var * 252.0))

    reactive_rv = max(vol_long, vol_21, vol_ewma, vol_parkinson, 0.90 * vol_10)
    # Aplica prêmio de risco de variância típico do book de opções da B3 (~12%)
    proxy_iv = reactive_rv * 1.12
    return round(max(0.18, min(0.85, proxy_iv)), 4)
