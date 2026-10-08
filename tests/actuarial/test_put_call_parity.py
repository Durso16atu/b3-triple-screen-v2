from src.engine.black_scholes import black_scholes_analytical
from src.engine.invariants import calculate_parity_deviation


def test_put_call_parity_actuarial():
    S = 100.0
    K = 100.0
    du = 126
    cdi = 0.105
    vol = 0.25

    call = black_scholes_analytical(S, K, du, cdi, vol, is_call=True)
    put = black_scholes_analytical(S, K, du, cdi, vol, is_call=False)

    dev = calculate_parity_deviation(call.price, put.price, S, K, du, cdi)
    assert dev <= 1e-4
