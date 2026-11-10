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
        strike_range_pct: tuple[float, float] = (-0.08, 0.24),
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

        # Garante strikes OTM na faixa Fernando Góes (R$ 0,10 a R$ 0,30) mesmo em ativos
        # de preço nominal elevado ou IV alta com vencimentos longos (ex: 27 DU)
        if du > 0 and spot > 0 and vol > 0:
            from scipy.optimize import brentq

            atm_p = cls.price(spot, spot, du, cdi_rate, vol, is_call=True).price
            for target_p in (0.32, 0.22, 0.14):
                if atm_p > target_p + 0.02:
                    try:
                        k_goes = brentq(
                            lambda k_val, tp=target_p: cls.price(
                                spot, k_val, du, cdi_rate, vol, is_call=True
                            ).price
                            - tp,
                            spot * 1.01,
                            spot * 6.0,
                        )
                        raw_strikes.append(round(float(k_goes), 1))
                    except (ValueError, RuntimeError):
                        pass

        strikes = sorted({k for k in raw_strikes if k > 0})

        exact_call_prices = [
            cls.price(spot, k, du, cdi_rate, vol, is_call=True).price for k in strikes
        ]
        tentative_call_prices = [round(p, 2) for p in exact_call_prices]
        convex_mask = verify_call_convexity(strikes, exact_call_prices)

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

    @classmethod
    def build_hybrid_option_chain(
        cls,
        ticker: str,
        spot: float,
        du: int,
        cdi_rate: float,
        fallback_vol: float,
        maturity_date: date | str,
        call_series: str,
        put_series: str,
        real_quotes: list[Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Constrói grade híbrida B3 (Opções.Net) com IV calibrada marcada ao Spot atual."""
        if not real_quotes or len(real_quotes) < 3 or du <= 0:
            return cls.build_option_chain(
                ticker=ticker,
                spot=spot,
                du=du,
                cdi_rate=cdi_rate,
                vol=fallback_vol,
                maturity_date=maturity_date,
                call_series=call_series,
                put_series=put_series,
            )

        from scipy.optimize import brentq

        mat_str = (
            maturity_date.isoformat() if isinstance(maturity_date, date) else str(maturity_date)
        )
        t_years = du / 252.0
        r_c = math.log(1.0 + cdi_rate)

        def _solve_iv(mkt_p: float, s_ref: float, k_val: float, du_ref: int) -> float | None:
            if du_ref <= 0 or s_ref <= 0 or k_val <= 0:
                return None
            intrin = max(0.0, s_ref - k_val)
            if mkt_p <= intrin + 1e-3:
                return None
            try:
                return float(
                    brentq(
                        lambda v: black_scholes_analytical(
                            s_ref, k_val, du_ref, cdi_rate, v, is_call=True
                        ).price
                        - mkt_p,
                        0.05,
                        3.50,
                    )
                )
            except (ValueError, RuntimeError):
                return None

        sorted_quotes = sorted(real_quotes, key=lambda q: float(q.strike))
        calibrated_ivs: list[float | None] = []
        for q in sorted_quotes:
            iv_q = _solve_iv(
                mkt_p=float(q.last_price),
                s_ref=float(q.ref_spot_price or spot),
                k_val=float(q.strike),
                du_ref=int(q.ref_du or du),
            )
            calibrated_ivs.append(iv_q)

        valid_ivs = sorted(v for v in calibrated_ivs if v is not None and 0.10 <= v <= 2.0)
        median_iv = valid_ivs[len(valid_ivs) // 2] if valid_ivs else fallback_vol

        options: list[dict[str, Any]] = []
        for q, iv_raw in zip(sorted_quotes, calibrated_ivs, strict=False):
            strike = round(float(q.strike), 2)
            iv_used = max(0.12, min(1.80, float(iv_raw if iv_raw is not None else median_iv)))

            call_res = cls.price(spot, strike, du, cdi_rate, iv_used, is_call=True)
            put_res = cls.price(spot, strike, du, cdi_rate, iv_used, is_call=False)

            theo_price = round(float(call_res.price), 4)
            mkt_price = round(float(q.last_price), 2)
            lower_bound = discounted_intrinsic_call(spot, strike, r_c, t_years)
            intrinsic_ok = check_intrinsic_bound(theo_price, spot, strike, is_call=True)

            if theo_price < lower_bound - 1e-4 or not intrinsic_ok or theo_price <= 0:
                continue

            parity_theoretical = spot - strike * math.exp(-r_c * t_years)
            parity_actual = call_res.price - put_res.price
            parity_violation = round(abs(parity_actual - parity_theoretical), 4)

            options.append(
                {
                    "symbol": str(q.symbol),
                    "underlying_ticker": str(ticker),
                    "type": "CALL",
                    "style": str(q.style) if q.style in ("AMERICAN", "EUROPEAN") else "EUROPEAN",
                    "strike": strike,
                    "maturity_date": str(q.maturity_date or mat_str),
                    "du": int(du),
                    "spot_price": float(spot),
                    "market_price": mkt_price,
                    "theoretical_price": theo_price,
                    "iv": round(iv_used, 4),
                    "num_trades": int(getattr(q, "num_trades", 0)),
                    "financial_volume": float(getattr(q, "financial_volume", 0.0)),
                    "has_market_maker": bool(getattr(q, "has_market_maker", False)),
                    "is_real_b3_ticker": True,
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

        if len(options) < 3:
            return cls.build_option_chain(
                ticker=ticker,
                spot=spot,
                du=du,
                cdi_rate=cdi_rate,
                vol=fallback_vol,
                maturity_date=maturity_date,
                call_series=call_series,
                put_series=put_series,
            )

        # Garante presença da faixa Fernando Góes (R$ 0,10 a R$ 0,30 OTM) na série ativa
        goes_present = [
            o for o in options if o["strike"] > spot and 0.08 <= o["theoretical_price"] <= 0.38
        ]
        if len(goes_present) < 2 and len(real_quotes) >= 5 and du > 0 and spot > 0:
            base_symbol = ticker[:4] if len(ticker) >= 4 else ticker
            existing_strikes = [o["strike"] for o in options]
            atm_p = cls.price(spot, spot, du, cdi_rate, median_iv, is_call=True).price
            for target_p in (0.28, 0.18, 0.12):
                if atm_p <= target_p + 0.02:
                    continue
                try:
                    k_goes = round(
                        float(
                            brentq(
                                lambda k_val, tp=target_p: cls.price(
                                    spot, k_val, du, cdi_rate, median_iv, is_call=True
                                ).price
                                - tp,
                                spot * 1.01,
                                spot * 6.0,
                            )
                        ),
                        1,
                    )
                except (ValueError, RuntimeError):
                    continue
                if any(abs(k_goes - ek) < spot * 0.008 for ek in existing_strikes):
                    continue
                c_res = cls.price(spot, k_goes, du, cdi_rate, median_iv, is_call=True)
                p_res = cls.price(spot, k_goes, du, cdi_rate, median_iv, is_call=False)
                t_price = round(float(c_res.price), 4)
                if not (0.08 <= t_price <= 0.38):
                    continue
                par_theo = spot - k_goes * math.exp(-r_c * t_years)
                par_viol = round(abs((c_res.price - p_res.price) - par_theo), 4)
                strike_code = int(round(k_goes * 10))
                options.append(
                    {
                        "symbol": f"{base_symbol}{call_series}{strike_code}",
                        "underlying_ticker": str(ticker),
                        "type": "CALL",
                        "style": "EUROPEAN",
                        "strike": float(k_goes),
                        "maturity_date": mat_str,
                        "du": int(du),
                        "spot_price": float(spot),
                        "market_price": round(t_price, 2),
                        "theoretical_price": t_price,
                        "iv": round(float(median_iv), 4),
                        "greeks": {
                            "delta": round(float(c_res.delta), 4),
                            "gamma": round(float(c_res.gamma), 4),
                            "theta_du": round(float(c_res.theta_du), 4),
                            "vega": round(float(c_res.vega), 4),
                            "rho": round(float(c_res.rho), 4),
                        },
                        "actuarial_checks": {
                            "intrinsic_bound_ok": True,
                            "parity_violation_brl": float(par_viol),
                        },
                    }
                )
                existing_strikes.append(k_goes)

        return sorted(options, key=lambda x: x["strike"])
