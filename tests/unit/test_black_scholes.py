"""Testes unitários e atuariais do motor de precificação Black-Scholes."""

import math

from src.engine.black_scholes import BlackScholesEngine, black_scholes_analytical


def test_call_bs_basic():
    """Valida precificação analítica de Call com benchmark fechado de Hull (1997)."""
    # Hull Benchmark: S=42, K=40, r_c=0.10, t=0.5 (du=126), vol=0.20
    cdi_hull = math.exp(0.10) - 1.0
    res = black_scholes_analytical(
        S=42.0, K=40.0, du=126, cdi_anual=cdi_hull, vol=0.20, is_call=True
    )
    assert math.isclose(res.price, 4.7594, abs_tol=1e-3)
    assert math.isclose(res.delta, 0.7791, abs_tol=1e-3)
    assert math.isclose(res.gamma, 0.0494, abs_tol=1e-3)
    assert 0.0 <= res.delta <= 1.0
    assert res.gamma > 0.0
    assert res.vega > 0.0
    assert res.theta_du < 0.0


def test_put_bs_basic():
    """Valida precificação analítica de Put com benchmark fechado de Hull (1997)."""
    # Hull Benchmark: S=42, K=40, r_c=0.10, t=0.5 (du=126), vol=0.20
    cdi_hull = math.exp(0.10) - 1.0
    res = black_scholes_analytical(
        S=42.0, K=40.0, du=126, cdi_anual=cdi_hull, vol=0.20, is_call=False
    )
    assert math.isclose(res.price, 0.8086, abs_tol=1e-3)
    assert math.isclose(res.delta, -0.2209, abs_tol=1e-3)
    assert -1.0 <= res.delta <= 0.0
    assert res.gamma > 0.0
    assert res.vega > 0.0
    assert res.theta_du < 0.0


def test_bs_du_zero():
    """Valida comportamento na data de expiração (du=0): valor intrínseco e delta degrau."""
    # Call OTM
    res1 = black_scholes_analytical(S=90.0, K=100.0, du=0, cdi_anual=0.105, vol=0.20, is_call=True)
    assert res1.price == 0.0
    assert res1.delta == 0.0

    # Call ITM
    res2 = black_scholes_analytical(S=110.0, K=100.0, du=0, cdi_anual=0.105, vol=0.20, is_call=True)
    assert res2.price == 10.0
    assert res2.delta == 1.0


def test_unified_black_scholes_engine():
    """Valida métodos da classe BlackScholesEngine com benchmark ATM fechado e paridade."""
    bs = BlackScholesEngine()
    # Benchmark analítico ATM: S=100, K=100, r_c=0.05, t=1.0 (du=252), vol=0.20
    cdi_atm = math.exp(0.05) - 1.0
    res_call = bs.price(100.0, 100.0, du=252, cdi_anual=cdi_atm, vol=0.20, is_call=True)
    res_put = bs.price(100.0, 100.0, du=252, cdi_anual=cdi_atm, vol=0.20, is_call=False)

    # Valores de referência analíticos fechados (não-circulares)
    assert math.isclose(res_call.price, 10.4506, abs_tol=1e-3)
    assert math.isclose(res_put.price, 5.5735, abs_tol=1e-3)
    assert math.isclose(res_call.delta, 0.6368, abs_tol=1e-3)
    assert math.isclose(res_put.delta, -0.3632, abs_tol=1e-3)

    # Paridade Put-Call analítica contínua exata: C - P == S - K * exp(-r*t)
    expected_diff = 100.0 - 100.0 * math.exp(-0.05 * 1.0)
    assert math.isclose(res_call.price - res_put.price, expected_diff, abs_tol=1e-10)


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
