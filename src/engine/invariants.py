import math


def check_intrinsic_bound(market_price: float, S: float, K: float, is_call: bool) -> bool:
    intrinsic = max(0.0, S - K) if is_call else max(0.0, K - S)
    return market_price >= intrinsic


def calculate_parity_deviation(
    call_price: float,
    put_price: float,
    S: float,
    K: float,
    du: int,
    cdi_anual: float,
    q: float = 0.0,
) -> float:
    t = du / 252.0
    r_c = math.log(1.0 + cdi_anual)

    expected_diff = S * math.exp(-q * t) - K * math.exp(-r_c * t)
    actual_diff = call_price - put_price

    return abs(actual_diff - expected_diff)
