"""Testes de consistência matemática, atuarial e de calendário para a B3."""

import math
from datetime import date

from src.engine.black_scholes import BlackScholesEngine
from src.engine.calendar_anbima import B3Calendar
from src.engine.invariants import verify_call_convexity


def test_calendar_holiday_20_november_and_option_maturity():
    cal = B3Calendar()
    # Lei 14.759/2023: vigência a partir de 2024
    assert cal.is_working_day(date(2023, 11, 20))

    feriado_20_nov = date(2026, 11, 20)
    assert not cal.is_working_day(feriado_20_nov)
    assert not cal.is_trading_day(feriado_20_nov)

    maturity_nov_2026 = cal.get_option_maturity(2026, 11)
    assert maturity_nov_2026 == date(2026, 11, 19)
    assert cal.is_working_day(maturity_nov_2026)
    assert cal.is_trading_day(maturity_nov_2026)


def test_target_2r_exact_consistency():
    trigger = 38.50
    stop_loss = 37.20
    risk_r = round(trigger - stop_loss, 2)
    target_2r = round(trigger + 2.0 * risk_r, 2)
    assert math.isclose((target_2r - trigger) / risk_r, 2.0, abs_tol=1e-5)


def test_put_call_parity_continuous_di():
    bs = BlackScholesEngine()
    spot, strike, cdi_annual = 40.0, 42.0, 0.1075
    r_c = math.log(1.0 + cdi_annual)
    t_years = 26 / 252.0
    sigma = 0.30

    call_p = bs.call_price(spot, strike, r_c, t_years, sigma)
    put_p = bs.put_price(spot, strike, r_c, t_years, sigma)
    assert math.isclose(call_p - put_p, spot - strike * math.exp(-r_c * t_years), abs_tol=1e-4)


def test_option_chain_convexity():
    strikes = [38.0, 40.0, 42.0, 44.0]
    valid_prices = [3.20, 1.80, 0.90, 0.35]
    assert all(verify_call_convexity(strikes, valid_prices))

    invalid_prices = [3.20, 2.30, 0.90, 0.35]
    assert not verify_call_convexity(strikes, invalid_prices)[1]
