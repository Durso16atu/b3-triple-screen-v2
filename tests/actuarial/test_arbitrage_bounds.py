def test_intrinsic_call_bound():
    """
    Testes atuariais básicos de fumaça para limite intrínseco de Call.
    O preço de uma opção de compra (Call) não pode ser menor que max(0, S - K).
    """
    S = 100.0  # Preço do ativo objeto
    K = 90.0  # Preço de exercício (Strike)
    C = 12.0  # Preço da Call

    limite_intrinseco = max(0, S - K)
    error_msg = f"O preço da Call ({C}) viola o limite ({limite_intrinseco})"
    assert limite_intrinseco <= C, error_msg
