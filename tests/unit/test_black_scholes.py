from src.engine.black_scholes import black_scholes_analytical


def test_call_bs_basic():
    res = black_scholes_analytical(
        S=100.0, K=100.0, du=252, cdi_anual=0.105, vol=0.20, is_call=True
    )
    assert res.price > 0.0
    assert 0.0 <= res.delta <= 1.0
    assert res.gamma > 0.0
    assert res.vega > 0.0
    assert res.theta_du < 0.0


def test_put_bs_basic():
    res = black_scholes_analytical(
        S=100.0, K=100.0, du=252, cdi_anual=0.105, vol=0.20, is_call=False
    )
    assert res.price > 0.0
    assert -1.0 <= res.delta <= 0.0
    assert res.gamma > 0.0
    assert res.vega > 0.0
    assert res.theta_du < 0.0


def test_bs_du_zero():
    # Call OTM
    res1 = black_scholes_analytical(S=90.0, K=100.0, du=0, cdi_anual=0.105, vol=0.20, is_call=True)
    assert res1.price == 0.0
    assert res1.delta == 0.0

    # Call ITM
    res2 = black_scholes_analytical(S=110.0, K=100.0, du=0, cdi_anual=0.105, vol=0.20, is_call=True)
    assert res2.price == 10.0
    assert res2.delta == 1.0
