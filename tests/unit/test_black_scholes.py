import math

from src.engine.black_scholes import BlackScholesEngine, black_scholes_analytical


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


def test_unified_black_scholes_engine():
    """Valida métodos da classe BlackScholesEngine e paridade Put-Call analítica."""
    bs = BlackScholesEngine()
    spot, strike, cdi = 50.0, 50.0, 0.12
    r_c = math.log(1.0 + cdi)
    t_years = 45 / 252.0
    vol = 0.25

    c_price = bs.call_price(spot, strike, r_c, t_years, vol)
    p_price = bs.put_price(spot, strike, r_c, t_years, vol)

    # Paridade Put-Call contínua
    expected_diff = spot - strike * math.exp(-r_c * t_years)
    assert math.isclose(c_price - p_price, expected_diff, abs_tol=1e-5)

    # Preço via price()
    res_call = bs.price(spot, strike, du=45, cdi_anual=cdi, vol=vol, is_call=True)
    assert math.isclose(res_call.price, c_price, abs_tol=1e-5)


def test_build_option_chain():
    """Valida a construção unificada da grade de opções B3."""
    chain = BlackScholesEngine.build_option_chain(
        ticker="PETR4",
        spot=40.0,
        du=25,
        cdi_rate=0.1075,
        vol=0.28,
        maturity_date="2026-11-19",
        call_series="K",
        put_series="W",
    )

    assert len(chain) >= 4
    for opt in chain:
        assert opt["underlying_ticker"] == "PETR4"
        assert opt["type"] == "CALL"
        assert opt["style"] == "EUROPEAN"
        assert opt["symbol"].startswith("PETRK")
        assert opt["strike"] > 0
        assert opt["market_price"] > 0
        assert opt["theoretical_price"] > 0
        assert opt["actuarial_checks"]["intrinsic_bound_ok"] is True
        assert opt["actuarial_checks"]["parity_violation_brl"] < 1e-3
        assert 0.0 <= opt["greeks"]["delta"] <= 1.0
