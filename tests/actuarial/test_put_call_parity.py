"""Validação atuarial da Paridade Put-Call para opções sobre ações na B3."""

import math

from src.engine.black_scholes import black_scholes_analytical
from src.engine.invariants import calculate_parity_deviation


def test_put_call_parity_actuarial():
    """Valida que o desvio de paridade put-call respeita a tolerância atuarial."""
    S = 100.0
    K = 100.0
    du = 126
    cdi = 0.105
    vol = 0.25

    call = black_scholes_analytical(S, K, du, cdi, vol, is_call=True)
    put = black_scholes_analytical(S, K, du, cdi, vol, is_call=False)

    dev = calculate_parity_deviation(call.price, put.price, S, K, du, cdi)
    assert dev <= 1e-4

    # Validação com preços fechados do Benchmark Hull (1997): S=42, K=40, du=126, C=4.7594, P=0.8086
    cdi_hull = math.exp(0.10) - 1.0
    dev_hull = calculate_parity_deviation(4.7594, 0.8086, 42.0, 40.0, 126, cdi_hull)
    assert dev_hull <= 1e-3
