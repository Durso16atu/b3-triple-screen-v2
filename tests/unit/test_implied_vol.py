"""Testes unitários para o cálculo de volatilidade implícita."""

import math

import numpy as np
import pandas as pd

from src.engine.black_scholes import black_scholes_analytical
from src.engine.implied_vol import estimate_reactive_volatility, get_implied_volatility


def test_iv_recovery():
    """Valida convergência de Newton-Raphson para volatilidade implícita."""
    S = 100.0
    K = 100.0
    du = 63
    cdi = 0.105
    target_vol = 0.30

    res = black_scholes_analytical(S, K, du, cdi, target_vol, is_call=True)
    price = res.price

    iv = get_implied_volatility(price, S, K, du, cdi, is_call=True)
    assert iv is not None
    assert abs(iv - target_vol) < 1e-4


def test_iv_recovery_hull_benchmark():
    """Valida recuperação de volatilidade implícita no benchmark analítico de Hull."""
    # S=42, K=40, du=126, vol=0.20 -> Preço fechado = 4.7594
    cdi_hull = math.exp(0.10) - 1.0
    iv = get_implied_volatility(4.7594, 42.0, 40.0, 126, cdi_hull, is_call=True)
    assert iv is not None
    assert math.isclose(iv, 0.2000, abs_tol=1e-3)


def test_iv_intrinsic_violation():
    """Valida rejeição de preços que violam o limite inferior imediato."""
    S = 100.0
    K = 100.0
    du = 63
    cdi = 0.105
    market_price = -1.0

    iv = get_implied_volatility(market_price, S, K, du, cdi, is_call=True)
    assert iv is None


def test_estimate_reactive_volatility_captures_recent_shock():
    """Valida que estimate_reactive_volatility reage a choques de curto prazo (10d/21d)."""
    calm = np.linspace(40.0, 42.0, 230)
    shock = np.array([42.2, 44.5, 43.8, 46.9, 45.5, 48.2, 47.0, 49.8, 48.5, 50.4])
    close = np.concatenate([calm, shock])
    df = pd.DataFrame(
        {
            "Open": close * 0.995,
            "High": close * 1.018,
            "Low": close * 0.982,
            "Close": close,
        }
    )
    long_vol = float(np.log(df["Close"] / df["Close"].shift(1)).dropna().std() * math.sqrt(252))
    reactive_vol = estimate_reactive_volatility(df)
    assert reactive_vol > long_vol
    assert 0.25 <= reactive_vol <= 0.85
