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
