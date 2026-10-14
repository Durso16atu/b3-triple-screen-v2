"""Motor analítico e atuarial de precificação Black-Scholes para opções da B3."""

import math
from dataclasses import dataclass
from datetime import date
from typing import Any

from scipy.stats import norm

from src.engine.invariants import (
    check_intrinsic_bound,
    discounted_intrinsic_call,
    verify_call_convexity,
)


@dataclass(frozen=True)
class OptionPricingResult:
    price: float
    delta: float
    gamma: float
    theta_du: float
    vega: float
    rho: float


def compute_d1_d2(
    S: float, K: float, r_c: float, q: float, vol: float, t: float
) -> tuple[float, float]:
    """Calcula d1 e d2 no modelo Black-Scholes-Merton com dividendo contínuo q."""
    if t <= 0 or vol <= 0:
        return 0.0, 0.0
    num = math.log(S / K) + (r_c - q + 0.5 * vol**2) * t
    den = vol * math.sqrt(t)
    d1 = num / den
    d2 = d1 - den
    return d1, d2


def black_scholes_analytical(
    S: float,
    K: float,
    du: int,
    cdi_anual: float,
    vol: float,
    is_call: bool,
    q: float = 0.0,
) -> OptionPricingResult:
    """Calcula preço analítico e gregas de opções europeias na convenção B3 (252 DU)."""
    if du <= 0:
        intrinsic = max(0.0, S - K) if is_call else max(0.0, K - S)
        delta = (1.0 if S > K else 0.0) if is_call else (-1.0 if S < K else 0.0)
        if S == K:
            delta = 0.5 if is_call else -0.5
        return OptionPricingResult(
            price=intrinsic, delta=delta, gamma=0.0, theta_du=0.0, vega=0.0, rho=0.0
        )

    t = du / 252.0
    r_c = math.log(1.0 + cdi_anual)

    d1, d2 = compute_d1_d2(S, K, r_c, q, vol, t)

    phi_d1 = norm.cdf(d1)
    phi_d2 = norm.cdf(d2)
    phi_minus_d1 = norm.cdf(-d1)
    phi_minus_d2 = norm.cdf(-d2)
    pdf_d1 = norm.pdf(d1)

    if is_call:
        price = S * math.exp(-q * t) * phi_d1 - K * math.exp(-r_c * t) * phi_d2
        delta = math.exp(-q * t) * phi_d1
        rho_t = K * t * math.exp(-r_c * t) * phi_d2
    else:
        price = K * math.exp(-r_c * t) * phi_minus_d2 - S * math.exp(-q * t) * phi_minus_d1
        delta = math.exp(-q * t) * (phi_d1 - 1.0)
        rho_t = -K * t * math.exp(-r_c * t) * phi_minus_d2

    gamma = math.exp(-q * t) * pdf_d1 / (S * vol * math.sqrt(t))
    vega = S * math.exp(-q * t) * pdf_d1 * math.sqrt(t)

    # Theta por dia útil decorrido (t - 1 DU)
    if du >= 1:
        t_m1 = (du - 1) / 252.0
        if t_m1 <= 0:
            intrin_next = max(0.0, S - K) if is_call else max(0.0, K - S)
            theta_du = intrin_next - price
        else:
            d1_n, d2_n = compute_d1_d2(S, K, r_c, q, vol, t_m1)
            if is_call:
                price_next = S * math.exp(-q * t_m1) * norm.cdf(d1_n) - K * math.exp(
                    -r_c * t_m1
                ) * norm.cdf(d2_n)
            else:
                price_next = K * math.exp(-r_c * t_m1) * norm.cdf(-d2_n) - S * math.exp(
                    -q * t_m1
                ) * norm.cdf(-d1_n)
            theta_du = price_next - price
    else:
        theta_du = 0.0

    return OptionPricingResult(price, delta, gamma, theta_du, vega, rho_t)


class BlackScholesEngine:
    """Motor analítico e atuarial de precificação Black-Scholes para opções da B3."""

    @staticmethod
    def compute_d1_d2(
        S: float, K: float, r_c: float, q: float, vol: float, t: float
    ) -> tuple[float, float]:
        return compute_d1_d2(S, K, r_c, q, vol, t)

    @classmethod
    def price(
        cls,
        S: float,
        K: float,
        du: int,
        cdi_anual: float,
        vol: float,
        is_call: bool,
        q: float = 0.0,
    ) -> OptionPricingResult:
        """Calcula preço analítico e gregas atuariais para opções europeias na convenção B3."""
        return black_scholes_analytical(S, K, du, cdi_anual, vol, is_call, q)

    @staticmethod
    def call_price(
        spot: float, strike: float, r_c: float, t_years: float, sigma: float, q: float = 0.0
    ) -> float:
        """Preço fechado de Call europeia com taxa contínua r_c e tempo em anos."""
        if t_years <= 0:
            return max(0.0, spot - strike)
        if sigma <= 0:
            return max(0.0, spot * math.exp(-q * t_years) - strike * math.exp(-r_c * t_years))
        d1, d2 = compute_d1_d2(spot, strike, r_c, q, sigma, t_years)
        return spot * math.exp(-q * t_years) * norm.cdf(d1) - strike * math.exp(
            -r_c * t_years
        ) * norm.cdf(d2)

    @staticmethod
    def put_price(
        spot: float, strike: float, r_c: float, t_years: float, sigma: float, q: float = 0.0
    ) -> float:
        """Preço fechado de Put europeia com taxa contínua r_c e tempo em anos."""
        if t_years <= 0:
            return max(0.0, strike - spot)
        if sigma <= 0:
            return max(0.0, strike * math.exp(-r_c * t_years) - spot * math.exp(-q * t_years))
        d1, d2 = compute_d1_d2(spot, strike, r_c, q, sigma, t_years)
        return strike * math.exp(-r_c * t_years) * norm.cdf(-d2) - spot * math.exp(
            -q * t_years
        ) * norm.cdf(-d1)

    @classmethod
    def build_option_chain(
        cls,
        ticker: str,
        spot: float,
        du: int,
        cdi_rate: float,
        vol: float,
        maturity_date: date | str,
        call_series: str,
        put_series: str,
        strike_range_pct: tuple[float, float] = (-0.08, 0.12),
        strike_step_pct: float = 0.04,
    ) -> list[dict[str, Any]]:
        """Gera grade completa de opções com verificação estática de não-arbitragem e gregas."""
        mat_str = (
            maturity_date.isoformat() if isinstance(maturity_date, date) else str(maturity_date)
        )
        t_years = du / 252.0
        r_c = math.log(1.0 + cdi_rate)

        i_min = int(round(strike_range_pct[0] / strike_step_pct))
        i_max = int(round(strike_range_pct[1] / strike_step_pct))
        raw_strikes = [
            round(spot * (1.0 + i * strike_step_pct), 1) for i in range(i_min, i_max + 1)
        ]
        strikes = sorted({k for k in raw_strikes if k > 0})

        tentative_call_prices = [
            round(cls.price(spot, k, du, cdi_rate, vol, is_call=True).price, 2) for k in strikes
        ]
        convex_mask = verify_call_convexity(strikes, tentative_call_prices)

        options: list[dict[str, Any]] = []
        base_symbol = ticker[:4] if len(ticker) >= 4 else ticker

        for i, strike in enumerate(strikes):
            price_call = tentative_call_prices[i]
            lower_bound = discounted_intrinsic_call(spot, strike, r_c, t_years)
            intrinsic_ok = check_intrinsic_bound(price_call, spot, strike, is_call=True)

            if not convex_mask[i] or price_call < lower_bound - 1e-4 or not intrinsic_ok:
                continue

            call_res = cls.price(spot, strike, du, cdi_rate, vol, is_call=True)
            put_res = cls.price(spot, strike, du, cdi_rate, vol, is_call=False)

            parity_theoretical = spot - strike * math.exp(-r_c * t_years)
            parity_actual = call_res.price - put_res.price
            parity_violation = round(abs(parity_actual - parity_theoretical), 4)

            strike_code = int(round(strike * 10))
            symbol = f"{base_symbol}{call_series}{strike_code}"

            options.append(
                {
                    "symbol": symbol,
                    "underlying_ticker": str(ticker),
                    "type": "CALL",
                    "style": "EUROPEAN",
                    "strike": float(strike),
                    "maturity_date": mat_str,
                    "du": int(du),
                    "spot_price": float(spot),
                    "market_price": float(price_call),
                    "theoretical_price": round(float(call_res.price), 4),
                    "iv": round(float(vol), 4),
                    "greeks": {
                        "delta": round(float(call_res.delta), 4),
                        "gamma": round(float(call_res.gamma), 4),
                        "theta_du": round(float(call_res.theta_du), 4),
                        "vega": round(float(call_res.vega), 4),
                        "rho": round(float(call_res.rho), 4),
                    },
                    "actuarial_checks": {
                        "intrinsic_bound_ok": bool(intrinsic_ok),
                        "parity_violation_brl": float(parity_violation),
                    },
                }
            )

        return options
