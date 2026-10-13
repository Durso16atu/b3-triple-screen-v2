"""Validação de limites estáticos de não-arbitragem para derivativos na B3."""

import math


def verify_call_convexity(strikes: list[float], prices: list[float]) -> list[bool]:
    """Verifica convexidade e monotonicidade de Calls (ausência de arbitragem em borboleta)."""
    n = len(strikes)
    valid = [True] * n
    if n < 3:
        return valid

    for i in range(n - 1):
        if prices[i] < prices[i + 1] - 1e-4:
            valid[i] = False
            valid[i + 1] = False

    for i in range(1, n - 1):
        k1, k2, k3 = strikes[i - 1], strikes[i], strikes[i + 1]
        c1, c2, c3 = prices[i - 1], prices[i], prices[i + 1]
        lam = (k3 - k2) / (k3 - k1)
        max_convex_price = lam * c1 + (1.0 - lam) * c3
        if c2 > max_convex_price + 1e-4:
            valid[i] = False

    return valid


def discounted_intrinsic_call(spot: float, strike: float, r_c: float, t_years: float) -> float:
    """Limite inferior descontado de Merton: C >= max(0, S - K * exp(-r_c * t))."""
    return max(0.0, spot - strike * math.exp(-r_c * t_years))


def check_intrinsic_bound(market_price: float, S: float, K: float, is_call: bool) -> bool:
    """Verifica se o prêmio respeita o limite intrínseco imediato."""
    intrinsic = max(0.0, S - K) if is_call else max(0.0, K - S)
    return market_price >= intrinsic - 1e-4


def calculate_parity_deviation(
    call_price: float,
    put_price: float,
    S: float,
    K: float,
    du: int,
    cdi_anual: float,
    q: float = 0.0,
) -> float:
    """Calcula desvio absoluto em relação à paridade Put-Call europeia."""
    t = du / 252.0
    r_c = math.log(1.0 + cdi_anual)

    expected_diff = S * math.exp(-q * t) - K * math.exp(-r_c * t)
    actual_diff = call_price - put_price

    return abs(actual_diff - expected_diff)
