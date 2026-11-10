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
    """Estima volatilidade realizada robusta (Parkinson mediano 21d + EWMA 21d winsorizado)."""
    if df is None or len(df) < 20 or "Close" not in df:
        return default_vol

    close = df["Close"].astype(float)
    raw_returns = np.log(close / close.shift(1)).dropna()
    if len(raw_returns) < 15:
        return default_vol

    # Winsorização defensiva contra saltos artificiais de ajuste/agrupamento no yfinance (> 12%/dia)
    clean_returns = raw_returns.clip(lower=-0.12, upper=0.12)
    recent_21 = clean_returns.iloc[-21:]
    recent_10 = clean_returns.iloc[-10:]

    vol_21 = float(recent_21.std() * math.sqrt(252.0))
    vol_10 = float(recent_10.std() * math.sqrt(252.0))
    vol_ewma = float(clean_returns.ewm(alpha=0.10, adjust=False).std().iloc[-1] * math.sqrt(252.0))

    vol_parkinson = vol_21
    if "High" in df and "Low" in df:
        high = df["High"].astype(float).iloc[-21:]
        low = df["Low"].astype(float).iloc[-21:]
        valid_hl = (high > 0) & (low > 0) & (high >= low)
        if valid_hl.any():
            hl_ratio = (np.log(high[valid_hl] / low[valid_hl]) ** 2) / (4.0 * math.log(2.0))
            # Mediana corrigida para qui-quadrado(1) (~2.198) evita contaminação por 1 barra atípica
            park_var = float(np.median(hl_ratio)) * 2.198
            vol_parkinson = math.sqrt(max(0.0, park_var * 252.0))

    blended_vol = 0.45 * vol_parkinson + 0.35 * vol_ewma + 0.20 * max(vol_21, vol_10)
    return round(max(0.16, min(0.65, blended_vol)), 4)
