"""Testes unitários do motor matemático fractal PhiCube (Bo Williams, Góes & Moraes)."""

import numpy as np
import pandas as pd

from src.engine.phicube import (
    PhiCubeFilter,
    calc_caiu_comprou_series,
    calc_dmima,
    calc_hfma,
    calc_santo_state,
    calc_smart_ma_series,
)


def _make_trend_df(n: int = 220, direction: str = "up") -> pd.DataFrame:
    dates = pd.date_range(end="2026-10-16", periods=n, freq="B")
    if direction == "up":
        close = 25.0 + np.linspace(0.0, 20.0, n) + 0.15 * np.sin(np.arange(n) * 0.3)
    else:
        close = 45.0 - np.linspace(0.0, 20.0, n) + 0.15 * np.sin(np.arange(n) * 0.3)
    open_p = close - (0.15 if direction == "up" else -0.15)
    high = np.maximum(open_p, close) + 0.35
    low = np.minimum(open_p, close) - 0.35
    return pd.DataFrame(
        {
            "Open": open_p,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": np.full(n, 1_500_000.0),
        },
        index=dates,
    )


def test_hfma_and_dmima_monotonic_uptrend():
    """Valida que as DMIMAs em tendência de alta formam leque M17 > M34 > M72 > M144."""
    df = _make_trend_df(240, "up")
    c = df["Close"]
    hfma17 = calc_hfma(c, 17)
    m17 = calc_dmima(c, 17)
    m34 = calc_dmima(c, 34)
    m72 = calc_dmima(c, 72)
    m144 = calc_dmima(c, 144)

    assert len(hfma17) == len(c)
    assert float(m17.iloc[-1]) > float(m34.iloc[-1]) > float(m72.iloc[-1]) > float(m144.iloc[-1])


def test_caiu_comprou_and_smart_ma_bounds():
    """Valida que Caiu Comprou (78.6%) > Levantou Cortou (21.4%) e Smart MA respeita o corpo."""
    df = _make_trend_df(150, "up")
    cc, lc = calc_caiu_comprou_series(df["High"], df["Low"], period=72)
    sm_up, sm_lo = calc_smart_ma_series(df["Open"], df["Close"])

    assert float(cc.iloc[-1]) > float(lc.iloc[-1])
    assert float(sm_up.iloc[-1]) >= float(sm_lo.iloc[-1])


def test_santo_state_uptrend_vs_downtrend():
    """Valida que o Santo Banda detecta ALTA em tendência ascendente e BAIXA em descendente."""
    df_up = _make_trend_df(200, "up")
    df_dn = _make_trend_df(200, "down")

    st_up = calc_santo_state(df_up["Close"], 17)
    st_dn = calc_santo_state(df_dn["Close"], 17)

    assert st_up.iloc[-1] == "ALTA"
    assert st_dn.iloc[-1] == "BAIXA"


def test_phicube_filter_evaluate_and_enrich():
    """Valida o filtro completo PhiCube (MIMA 5/5, Grande Tacada, PV/PC e Alvos Phibo)."""
    df_up = _make_trend_df(240, "up")
    flt = PhiCubeFilter()

    res = flt.evaluate("PETR4", df_up)
    assert res.ticker == "PETR4"
    assert res.mima_alignment_score >= 4
    assert res.mima_fan_state == "LEQUE_ALTA"
    assert res.grande_tacada_aligned is True
    assert res.pv_pc_rule == "PV_PROIBIDO_VENDER"
    assert res.phibo_1618 > res.phibo_100 >= res.phibo_618
    assert res.confluence_verdict in ("FORTE_COMPRA", "COMPRA_PULLBACK")

    enriched = flt.enrich_ohlc_dataframe(df_up)
    cols = ("mima17", "mima72", "mima144", "pv_support", "pc_resist", "smart_upper", "smart_lower")
    for col in cols:
        assert col in enriched.columns
        assert not np.isnan(float(enriched[col].iloc[-1]))
