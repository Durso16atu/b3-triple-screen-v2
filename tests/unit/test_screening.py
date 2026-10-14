import math
from datetime import date

import numpy as np
import pandas as pd

from src.engine.calendar_anbima import is_last_trading_day_of_week
from src.engine.screening import ScreeningResult, TripleScreenFilter


def _generate_synthetic_ohlcv(
    n_days: int = 220,
    end_date: str = "2026-10-07",
    mode: str = "bull_pullback",
) -> pd.DataFrame:
    """Gera dados sintéticos OHLCV com histórico suficiente (>= 35 semanas fechadas)."""
    dates = pd.date_range(end=end_date, periods=n_days, freq="B")

    if mode == "bull_pullback":
        # Trajetória em alta acelerada
        t = np.linspace(1, 3, n_days)
        close = 15.0 + (t**2.5) * 5.0
        # Recuo nos últimos 3 dias para estocástico em sobrevenda (< 30) e bounce
        close[-3] = close[-4] - 6.0
        close[-2] = close[-4] - 7.5
        close[-1] = close[-4] - 7.0
        high = close + 0.5
        low = close - 0.5
        high[-10] = 93.0
        low[-2] = close[-2] - 0.5
        high[-2] = close[-2] + 0.5
        low[-1] = close[-1] - 0.5
        high[-1] = close[-1] + 0.5
        open_p = close - 0.1
        volume = np.full(n_days, 1000000.0)
    elif mode == "bull_neutral_stoch":
        # Alta acelerada semanal, mas com estocástico diário na zona neutra (%K ~ 50)
        t = np.linspace(1, 3, n_days)
        close = 15.0 + (t**2.5) * 5.0
        close[-3] = close[-4] - 2.0
        close[-2] = close[-4] - 3.5
        close[-1] = close[-4] - 3.8
        high = close + 1.0
        low = close - 1.0
        open_p = close - 0.1
        volume = np.full(n_days, 1000000.0)
    elif mode == "bearish":
        # Trajetória em baixa
        t = np.linspace(1, 3, n_days)
        close = 100.0 - (t**2.5) * 5.0
        high = close + 0.5
        low = close - 0.5
        open_p = close + 0.1
        volume = np.full(n_days, 1000000.0)
    else:  # flat / neutro
        close = np.full(n_days, 50.0)
        high = close + 0.5
        low = close - 0.5
        open_p = close
        volume = np.full(n_days, 1000000.0)

    return pd.DataFrame(
        {
            "Open": open_p,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=dates,
    )


def test_calculate_weekly_indicators():
    df = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-09", mode="bull_pullback")
    weekly = TripleScreenFilter.calculate_weekly_indicators(df)

    assert "ema13" in weekly.columns
    assert "ema13_slope" in weekly.columns
    assert "macd_hist" in weekly.columns
    assert "macd_hist_slope" in weekly.columns
    assert len(weekly) >= 35


def test_calculate_daily_indicators():
    df = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-09", mode="bull_pullback")
    daily = TripleScreenFilter.calculate_daily_indicators(df)

    assert "stoch_k" in daily.columns
    assert "stoch_d" in daily.columns
    assert "force_index_ema2" in daily.columns
    last_k = float(daily["stoch_k"].iloc[-1])
    assert not math.isnan(last_k)


def test_statistical_warmup_requirement():
    """Valida rejeição com < 35 semanas fechadas vs aprovação com >= 35 semanas."""
    ts = TripleScreenFilter(min_closed_weeks=35)

    # Série curta: 120 dias úteis (~24 semanas fechadas < 35)
    df_curto = _generate_synthetic_ohlcv(n_days=120, end_date="2026-10-09")
    res_curto = ts.evaluate("PETR4", df_curto)
    assert res_curto is not None
    assert res_curto.signal_status == "INSUFFICIENT_DATA"
    assert res_curto.trigger_buy_stop is None
    assert res_curto.entry_trigger is None
    assert res_curto.stop_loss is None
    assert res_curto.target_2r is None
    assert res_curto.target_price is None

    # Série longa: 220 dias úteis (~44 semanas fechadas >= 35)
    df_longo = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-07")
    res_longo = ts.evaluate("PETR4", df_longo)
    assert res_longo is not None
    assert res_longo.signal_status != "INSUFFICIENT_DATA"


def test_weekly_closed_bar_detection_friday_vs_wednesday():
    """Avaliação na sexta-feira usa a própria semana fechada; na quarta-feira descarta a aberta."""
    ts = TripleScreenFilter(min_closed_weeks=35)

    # Sexta-feira 2026-10-09 é dia de fechamento semanal
    df_fri = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-09")
    assert is_last_trading_day_of_week(date(2026, 10, 9))
    weekly_fri = ts.calculate_weekly_indicators(df_fri)
    assert weekly_fri.index[-1].date() == date(2026, 10, 9)

    # Quarta-feira 2026-10-07: pregão intrassemanal, a barra da semana está em formação
    df_wed = df_fri[df_fri.index <= "2026-10-07"].copy()
    assert not is_last_trading_day_of_week(date(2026, 10, 7))
    weekly_wed = ts.calculate_weekly_indicators(df_wed)
    # A última semana fechada deve ser a sexta anterior (2026-10-02), descartando a semana de 07/10
    assert weekly_wed.index[-1].date() == date(2026, 10, 2)


def test_short_week_holiday_anticipation():
    """Garante que quinta-feira antes da Sexta-Feira Santa seja reconhecida como semana fechada."""
    ts = TripleScreenFilter(min_closed_weeks=35)

    # Sexta-Feira Santa 2026 é 03/04/2026. O último pregão da semana é quinta 02/04/2026.
    assert is_last_trading_day_of_week(date(2026, 4, 2))
    assert not is_last_trading_day_of_week(date(2026, 4, 1))

    df = _generate_synthetic_ohlcv(n_days=220, end_date="2026-04-02")
    weekly = ts.calculate_weekly_indicators(df)
    # Como quinta-feira fechou a semana, a barra semanal deve ser mantida
    assert weekly.index[-1].date() == date(2026, 4, 3)


def test_screen2_neutral_zone_restoration():
    """Garante que estocástico neutro (30 <= %K <= 70) resulte em NEUTRO e níveis None."""
    ts = TripleScreenFilter(min_closed_weeks=35)
    df_neutral = _generate_synthetic_ohlcv(
        n_days=220, end_date="2026-10-07", mode="bull_neutral_stoch"
    )

    res = ts.evaluate("PETR4", df_neutral)
    assert res is not None
    assert res.trend_weekly == "ALTA"
    assert res.wave_daily == "NEUTRO"
    assert res.signal_status == "AGUARDANDO"

    # Níveis devem ser estritamente None quando não armado
    assert res.trigger_buy_stop is None
    assert res.entry_trigger is None
    assert res.stop_loss is None
    assert res.target_2r is None
    assert res.target_price is None
    assert res.risk_r is None
    assert res.risk_reward is None


def test_evaluate_canonical_triple_screen_armed():
    """Valida o setup armado com cálculo de 2R exato e níveis operacionais."""
    ts = TripleScreenFilter(tick_size=0.01, min_closed_weeks=35)
    df_bull = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-07", mode="bull_pullback")

    res = ts.evaluate("PETR4", df_bull)
    assert isinstance(res, ScreeningResult)
    assert res.ticker == "PETR4"
    assert res.trend_weekly == "ALTA"
    assert res.wave_daily == "SOBREVENDA"
    assert res.signal_status == "ARMADO"

    assert res.trigger_buy_stop is not None
    assert res.entry_trigger == res.trigger_buy_stop
    assert res.stop_loss is not None
    assert res.target_2r is not None
    assert res.target_price == res.target_2r
    assert res.risk_r is not None
    assert res.risk_reward == res.risk_r

    assert res.trigger_buy_stop > res.stop_loss > 0

    expected_risk = round(res.trigger_buy_stop - res.stop_loss, 2)
    assert res.risk_r == expected_risk

    expected_2r = round(res.trigger_buy_stop + 2.0 * res.risk_r, 2)
    assert res.target_2r == expected_2r


def test_session_date_determinism():
    """Valida que session_date garante resultados reproduzíveis e determinísticos."""
    ts = TripleScreenFilter(min_closed_weeks=35)
    df = _generate_synthetic_ohlcv(n_days=250, end_date="2026-10-07")

    # Avaliação com session_date explicitamente definida no passado
    session_target = date(2026, 8, 28)
    res_explicit = ts.evaluate("PETR4", df, session_date=session_target)
    assert res_explicit is not None

    # Avaliação truncando o DataFrame manualmente até a mesma data
    df_manual = df[df.index <= "2026-08-28"].copy()
    res_manual = ts.evaluate("PETR4", df_manual)
    assert res_manual is not None

    assert res_explicit.trend_weekly == res_manual.trend_weekly
    assert res_explicit.wave_daily == res_manual.wave_daily
    assert res_explicit.signal_status == res_manual.signal_status
    assert res_explicit.macd_hist_slope == res_manual.macd_hist_slope
    assert res_explicit.ema13_weekly_slope == res_manual.ema13_weekly_slope


def test_evaluate_bearish_and_neutral():
    ts = TripleScreenFilter(tick_size=0.01, min_closed_weeks=35)

    df_bear = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-07", mode="bearish")
    res_bear = ts.evaluate("VALE3", df_bear)
    assert res_bear is not None
    assert res_bear.trend_weekly == "BAIXA"
    assert res_bear.signal_status in ("AGUARDANDO", "ARMADO_VENDA", "BLOQUEADO")
    # Para operações de compra, níveis devem ser None
    assert res_bear.trigger_buy_stop is None
    assert res_bear.stop_loss is None

    df_flat = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-07", mode="flat")
    res_flat = ts.evaluate("ITUB4", df_flat)
    assert res_flat is not None
    assert res_flat.trend_weekly == "NEUTRO"
    assert res_flat.signal_status == "BLOQUEADO"
    assert res_flat.trigger_buy_stop is None


def test_column_case_insensitive():
    df = _generate_synthetic_ohlcv(n_days=220, end_date="2026-10-07", mode="bull_pullback")
    df.columns = [c.lower() for c in df.columns]

    daily = TripleScreenFilter.calculate_daily_indicators(df)
    assert "stoch_k" in daily.columns

    weekly = TripleScreenFilter.calculate_weekly_indicators(df)
    assert "ema13" in weekly.columns
