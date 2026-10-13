import numpy as np
import pandas as pd

from src.engine.screening import ScreeningResult, TripleScreenFilter


def test_screen1_trend():
    assert TripleScreenFilter.screen1_trend(10.5, 10.0) == "ALTA"
    assert TripleScreenFilter.screen1_trend(9.5, 10.0) == "BAIXA"
    assert TripleScreenFilter.screen1_trend(10.0, 10.0) == "NEUTRO"


def test_screen2_elder_ray():
    bull, bear = TripleScreenFilter.screen2_elder_ray(high=12.0, low=9.0, ema_daily=10.0)
    assert bull == 2.0
    assert bear == -1.0


def test_screen3_select_options():
    df = pd.DataFrame(
        [
            {"du": 20, "delta": 0.20},
            {"du": 10, "delta": 0.20},
            {"du": 20, "delta": 0.50},
            {"du": 30, "delta": -0.20},
        ]
    )

    calls = TripleScreenFilter.screen3_select_options(df, is_call=True)
    assert len(calls) == 1
    assert calls.iloc[0]["delta"] == 0.20

    puts = TripleScreenFilter.screen3_select_options(df, is_call=False)
    assert len(puts) == 1
    assert puts.iloc[0]["delta"] == -0.20


def _generate_synthetic_ohlcv(n_days: int = 120, mode: str = "bull_pullback") -> pd.DataFrame:
    dates = pd.date_range(end="2026-10-09", periods=n_days, freq="B")

    if mode == "bull_pullback":
        drift = (np.linspace(1, 10, n_days)) ** 2
        close = 20.0 + drift
        close[-1] = close[-2] - 1.0  # pullback on last day
        high = close + 0.5
        low = close - 0.5
        open_p = close - 0.1
        volume = np.full(n_days, 1000000.0)
    elif mode == "bearish":
        drift = -((np.linspace(1, 10, n_days)) ** 2)
        close = 150.0 + drift
        high = close + 0.5
        low = close - 0.5
        open_p = close + 0.1
        volume = np.full(n_days, 1000000.0)
    else:
        close = np.full(n_days, 50.0)
        high = close + 0.5
        low = close - 0.5
        open_p = close
        volume = np.full(n_days, 1000000.0)

    df = pd.DataFrame(
        {
            "Open": open_p,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=dates,
    )
    return df


def test_calculate_weekly_indicators():
    df = _generate_synthetic_ohlcv(n_days=90, mode="bull_pullback")
    weekly = TripleScreenFilter.calculate_weekly_indicators(df)

    assert "ema13" in weekly.columns
    assert "ema13_slope" in weekly.columns
    assert "macd_hist" in weekly.columns
    assert "macd_hist_slope" in weekly.columns
    assert len(weekly) >= 10


def test_calculate_daily_indicators():
    df = _generate_synthetic_ohlcv(n_days=70, mode="bull_pullback")
    daily = TripleScreenFilter.calculate_daily_indicators(df)

    assert "stoch_k" in daily.columns
    assert "stoch_d" in daily.columns
    assert "force_index_ema2" in daily.columns
    assert daily["stoch_k"].iloc[-1] is not np.nan


def test_evaluate_insufficient_data():
    ts = TripleScreenFilter()
    df_short = _generate_synthetic_ohlcv(n_days=40)
    assert ts.evaluate("PETR4", df_short) is None


def test_evaluate_canonical_triple_screen_armed():
    ts = TripleScreenFilter(tick_size=0.01)
    df_bull = _generate_synthetic_ohlcv(n_days=120, mode="bull_pullback")

    res = ts.evaluate("PETR4", df_bull)
    assert isinstance(res, ScreeningResult)
    assert res.ticker == "PETR4"
    assert res.trend_weekly == "ALTA"
    assert res.wave_daily == "SOBREVENDA"
    assert res.signal_status == "ARMADO"

    assert res.trigger_buy_stop is not None
    assert res.stop_loss is not None
    assert res.target_2r is not None
    assert res.risk_r is not None
    assert res.trigger_buy_stop > res.stop_loss

    expected_risk = round(res.trigger_buy_stop - res.stop_loss, 2)
    assert res.risk_r == expected_risk

    expected_2r = round(res.trigger_buy_stop + 2.0 * res.risk_r, 2)
    assert res.target_2r == expected_2r


def test_evaluate_bearish_and_neutral():
    ts = TripleScreenFilter(tick_size=0.01)

    df_bear = _generate_synthetic_ohlcv(n_days=120, mode="bearish")
    res_bear = ts.evaluate("VALE3", df_bear)
    assert res_bear is not None
    assert res_bear.trend_weekly == "BAIXA"
    assert res_bear.signal_status == "BLOQUEADO"

    df_flat = _generate_synthetic_ohlcv(n_days=120, mode="flat")
    res_flat = ts.evaluate("ITUB4", df_flat)
    assert res_flat is not None
    assert res_flat.trend_weekly == "NEUTRO"
    assert res_flat.signal_status == "BLOQUEADO"


def test_column_case_insensitive():
    df = _generate_synthetic_ohlcv(n_days=70, mode="bull_pullback")
    df.columns = [c.lower() for c in df.columns]

    daily = TripleScreenFilter.calculate_daily_indicators(df)
    assert "stoch_k" in daily.columns

    weekly = TripleScreenFilter.calculate_weekly_indicators(df)
    assert "ema13" in weekly.columns
