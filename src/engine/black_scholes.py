import math
from dataclasses import dataclass

from scipy.stats import norm


@dataclass
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
    num = math.log(S / K) + (r_c - q + 0.5 * vol**2) * t
    den = vol * math.sqrt(t)
    d1 = num / den
    d2 = d1 - den
    return d1, d2


def black_scholes_analytical(
    S: float, K: float, du: int, cdi_anual: float, vol: float, is_call: bool, q: float = 0.0
) -> OptionPricingResult:
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
