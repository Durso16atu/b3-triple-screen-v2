from src.engine.black_scholes import black_scholes_analytical
from src.engine.implied_vol import get_implied_volatility


def test_iv_recovery():
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


def test_iv_intrinsic_violation():
    S = 100.0
    K = 100.0
    du = 63
    cdi = 0.105
    market_price = -1.0

    iv = get_implied_volatility(market_price, S, K, du, cdi, is_call=True)
    assert iv is None
