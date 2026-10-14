"""Testes de consistência matemática, atuarial e de calendário para a B3.

Validações canônicas de não-circularidade, limites de Merton e não-arbitragem.
"""

import math
from datetime import date

from scipy.stats import norm

from src.engine.black_scholes import BlackScholesEngine
from src.engine.calendar_anbima import B3Calendar
from src.engine.invariants import (
    check_intrinsic_bound,
    discounted_intrinsic_call,
    verify_call_convexity,
)


def test_calendar_holiday_20_november_and_option_maturity():
    """Valida a vigência da Lei 14.759/2023 (a partir de 2024) e antecipação de vencimento."""
    cal = B3Calendar()
    # Lei 14.759/2023: dia 20/11 era dia útil normal até 2023
    assert cal.is_working_day(date(2023, 11, 20))

    # A partir de 2024, 20/11 é feriado nacional
    feriado_20_nov = date(2026, 11, 20)
    assert not cal.is_working_day(feriado_20_nov)
    assert not cal.is_trading_day(feriado_20_nov)

    # 3ª sexta-feira de nov/2026 cai em 20/11 -> deve antecipar para quinta 19/11
    maturity_nov_2026 = cal.get_option_maturity(2026, 11)
    assert maturity_nov_2026 == date(2026, 11, 19)
    assert cal.is_working_day(maturity_nov_2026)
    assert cal.is_trading_day(maturity_nov_2026)


def test_target_2r_exact_consistency():
    """Valida a consistência matemática do Alvo 2R = Gatilho + 2 * (Gatilho - Stop)."""
    trigger = 38.50
    stop_loss = 37.20
    risk_r = round(trigger - stop_loss, 2)
    target_2r = round(trigger + 2.0 * risk_r, 2)
    assert math.isclose((target_2r - trigger) / risk_r, 2.0, abs_tol=1e-5)


def test_black_scholes_known_analytical_benchmarks():
    """Valida Black-Scholes contra benchmarks analíticos fechados da literatura (não-circular)."""
    bs = BlackScholesEngine()

    # Benchmark 1: John C. Hull (Options, Futures, and Other Derivatives)
    # S=42, K=40, r_c=0.10, t=0.5 (du=126), sigma=0.20
    # Valores analíticos fechados: C = 4.7594, P = 0.8086, Delta Call = 0.7791
    cdi_hull = math.exp(0.10) - 1.0
    res_hull_call = bs.price(42.0, 40.0, du=126, cdi_anual=cdi_hull, vol=0.20, is_call=True)
    res_hull_put = bs.price(42.0, 40.0, du=126, cdi_anual=cdi_hull, vol=0.20, is_call=False)

    assert math.isclose(res_hull_call.price, 4.7594, abs_tol=1e-3)
    assert math.isclose(res_hull_put.price, 0.8086, abs_tol=1e-3)
    assert math.isclose(res_hull_call.delta, 0.7791, abs_tol=1e-3)
    assert math.isclose(res_hull_put.delta, -0.2209, abs_tol=1e-3)

    # Benchmark 2: ATM canônico S=100, K=100, r_c=0.05, t=1.0 (du=252), sigma=0.20
    # d1 = 0.35, d2 = 0.15 => C = 10.4506, P = 5.5735, Delta Call = 0.6368
    cdi_atm = math.exp(0.05) - 1.0
    res_atm_call = bs.price(100.0, 100.0, du=252, cdi_anual=cdi_atm, vol=0.20, is_call=True)
    res_atm_put = bs.price(100.0, 100.0, du=252, cdi_anual=cdi_atm, vol=0.20, is_call=False)

    assert math.isclose(res_atm_call.price, 10.4506, abs_tol=1e-3)
    assert math.isclose(res_atm_put.price, 5.5735, abs_tol=1e-3)
    assert math.isclose(res_atm_call.delta, 0.6368, abs_tol=1e-3)
    assert math.isclose(res_atm_put.delta, -0.3632, abs_tol=1e-3)


def test_put_call_parity_continuous_di():
    """Valida a Paridade Put-Call contínua com taxa CDI: C - P == S - K * exp(-r_c * t)."""
    bs = BlackScholesEngine()
    spot, strike, cdi_annual = 40.0, 42.0, 0.1075
    r_c = math.log(1.0 + cdi_annual)
    t_years = 26 / 252.0
    sigma = 0.30

    call_p = bs.call_price(spot, strike, r_c, t_years, sigma)
    put_p = bs.put_price(spot, strike, r_c, t_years, sigma)

    expected_parity_diff = spot - strike * math.exp(-r_c * t_years)
    # Exatidão algébrica da paridade sem arbitragem
    assert math.isclose(call_p - put_p, expected_parity_diff, abs_tol=1e-10)


def test_merton_no_arbitrage_bounds():
    """Valida os limites teóricos descontados de Merton: max(0, S - K * exp(-rT)) <= C <= S."""
    bs = BlackScholesEngine()
    spot = 50.0
    cdi_annual = 0.12
    r_c = math.log(1.0 + cdi_annual)
    t_years = 63 / 252.0
    sigma = 0.25

    # Testa em strikes ITM, ATM e OTM
    for strike in [40.0, 50.0, 60.0]:
        call_p = bs.call_price(spot, strike, r_c, t_years, sigma)
        put_p = bs.put_price(spot, strike, r_c, t_years, sigma)

        lower_bound_call = discounted_intrinsic_call(spot, strike, r_c, t_years)
        discounted_k = strike * math.exp(-r_c * t_years)
        lower_bound_put = max(0.0, discounted_k - spot)

        # Merton Call Bounds: max(0, S - K*exp(-rT)) <= C <= S
        assert lower_bound_call <= call_p <= spot
        # Merton Put Bounds: max(0, K*exp(-rT) - S) <= P <= K*exp(-rT)
        assert lower_bound_put <= put_p <= discounted_k
        # Limite intrínseco imediato para Call americana/europeia (sem dividendos: C >= S - K)
        assert check_intrinsic_bound(call_p, spot, strike, is_call=True)


def test_option_chain_convexity_and_butterfly():
    """Valida a convexidade estrita em K: d^2C/dK^2 >= 0 e ausência de arbitragem em borboleta."""
    # 1. Validação analítica da segunda derivada em K
    spot = 50.0
    strike = 50.0
    r_c = 0.10
    t_years = 0.5
    sigma = 0.25

    num = math.log(spot / strike) + (r_c + 0.5 * sigma**2) * t_years
    denom_d = sigma * math.sqrt(t_years)
    d1 = num / denom_d
    d2 = d1 - denom_d
    denom = strike * sigma * math.sqrt(t_years)
    second_derivative = math.exp(-r_c * t_years) * norm.pdf(d2) / denom
    assert second_derivative > 0.0

    # 2. Grade de preços convexa válida (ausência de borboleta de custo negativo)
    strikes = [38.0, 40.0, 42.0, 44.0]
    valid_prices = [3.20, 1.80, 0.90, 0.35]
    assert all(verify_call_convexity(strikes, valid_prices))

    # 3. Grade com violação de convexidade (preço côncavo em K=40)
    invalid_prices = [3.20, 2.30, 0.90, 0.35]
    res_convexity = verify_call_convexity(strikes, invalid_prices)
    assert not res_convexity[1]
