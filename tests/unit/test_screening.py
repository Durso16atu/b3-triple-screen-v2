import pandas as pd

from src.engine.screening import TripleScreenFilter


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
