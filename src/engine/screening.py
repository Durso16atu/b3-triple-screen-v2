"""Motor de triagem quantitativa Triple Screen (Alexander Elder) para B3."""

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from src.engine.calendar_anbima import B3Calendar, is_last_trading_day_of_week


def _normalize_date(d: date | str) -> date:
    """Converte string ISO ou datetime para date puro."""
    if isinstance(d, str):
        return date.fromisoformat(d.split("T")[0])
    if type(d) is not date and hasattr(d, "date"):
        return d.date()
    return d


@dataclass(frozen=True)
class ScreeningResult:
    ticker: str
    trend_weekly: str  # 'ALTA', 'BAIXA', 'NEUTRO'
    macd_hist_slope: float
    ema13_weekly_slope: float
    stoch_k: float
    stoch_d: float
    force_index_ema2: float
    wave_daily: str  # 'SOBREVENDA', 'SOBRECOMPRA', 'NEUTRO'
    trigger_buy_stop: float | None
    stop_loss: float | None
    target_2r: float | None
    risk_r: float | None
    signal_status: str  # 'ARMADO', 'AGUARDANDO', 'BLOQUEADO', 'INSUFFICIENT_DATA', 'ARMADO_VENDA'
    diagnostic_reason: str = ""

    @property
    def entry_trigger(self) -> float | None:
        """Alias para o gatilho de entrada."""
        return self.trigger_buy_stop

    @property
    def target_price(self) -> float | None:
        """Alias para o preço alvo (2R)."""
        return self.target_2r

    @property
    def risk_reward(self) -> float | None:
        """Alias para o risco R."""
        return self.risk_r


class TripleScreenFilter:
    """Implementação canônica do Triple Screen de Alexander Elder para ações da B3.

    Contém:
    - Tela 1 (Maré Semanal): consenso entre inclinação da EMA 13 e inclinação do MACD Histograma
      (12, 26, 9) calculados sobre semanas estritamente fechadas (>= 35 semanas de aquecimento).
    - Tela 2 (Onda Diária): recuo em Estocástico Lento (%K < 30) confirmado por %D ou Force Index
      com zona NEUTRO restaurada para 30 <= %K <= 70.
    - Tela 3 (Gatilho Intradiário): Buy-Stop na máxima de D-1 + 1 tick e Stop Loss
      na mínima do recuo - 1 tick, com níveis estritamente None para ativos não armados.
    """

    def __init__(self, tick_size: float = 0.01, min_closed_weeks: int = 35):
        self.tick_size = tick_size
        self.min_closed_weeks = min_closed_weeks
        self.calendar = B3Calendar()

    @staticmethod
    def _normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
        """Padroniza nomes de colunas e garante índice temporal ordenado."""
        df_clean = df.copy()
        cols = {
            c: c.capitalize()
            for c in df_clean.columns
            if str(c).lower() in ["open", "high", "low", "close", "volume"]
        }
        if cols:
            df_clean = df_clean.rename(columns=cols)

        if not isinstance(df_clean.index, pd.DatetimeIndex):
            df_clean.index = pd.to_datetime(df_clean.index)

        df_clean = df_clean.sort_index()

        # Guarda defensiva contra dados espúrios (preços zerados ou negativos)
        if "Close" in df_clean.columns:
            df_clean = df_clean[df_clean["Close"] > 0]
        if "Low" in df_clean.columns and "Close" in df_clean.columns:
            invalid_low = (df_clean["Low"] <= 0) | df_clean["Low"].isna()
            df_clean.loc[invalid_low, "Low"] = df_clean.loc[invalid_low, "Close"]
        if "High" in df_clean.columns and "Close" in df_clean.columns:
            invalid_high = (df_clean["High"] <= 0) | df_clean["High"].isna()
            df_clean.loc[invalid_high, "High"] = df_clean.loc[invalid_high, "Close"]

        return df_clean

    @classmethod
    def calculate_weekly_indicators(
        cls, df_daily: pd.DataFrame, session_date: date | None = None
    ) -> pd.DataFrame:
        """Gera barras semanais fechadas (W-FRI) excluindo semana incompleta em formação.

        Usa B3Calendar.is_last_trading_day_of_week para determinar deterministicamente
        se a última barra diária fecha a semana.
        """
        df = cls._normalize_ohlcv(df_daily)
        if df.empty:
            return pd.DataFrame()

        if session_date is not None:
            session_dt = _normalize_date(session_date)
            df = df[df.index <= pd.Timestamp(session_dt)]
            if df.empty:
                return pd.DataFrame()

        weekly = (
            df.resample("W-FRI")
            .agg(
                {
                    "Open": "first",
                    "High": "max",
                    "Low": "min",
                    "Close": "last",
                    "Volume": "sum",
                }
            )
            .dropna()
        )

        if weekly.empty:
            return weekly

        last_daily_date = df.index[-1].date()
        is_closed = is_last_trading_day_of_week(last_daily_date)

        # Se o último candle diário não fecha a semana, a barra atual da semana está em aberto
        weekly_closed = weekly if is_closed else weekly.iloc[:-1].copy()

        if len(weekly_closed) < 2:
            return weekly_closed

        # Maré Semanal: EMA 13
        weekly_closed["ema13"] = weekly_closed["Close"].ewm(span=13, adjust=False).mean()
        weekly_closed["ema13_slope"] = weekly_closed["ema13"].diff()

        # Maré Semanal: MACD Histograma (12, 26, 9)
        ema12 = weekly_closed["Close"].ewm(span=12, adjust=False).mean()
        ema26 = weekly_closed["Close"].ewm(span=26, adjust=False).mean()
        weekly_closed["macd_line"] = ema12 - ema26
        weekly_closed["macd_signal"] = weekly_closed["macd_line"].ewm(span=9, adjust=False).mean()
        weekly_closed["macd_hist"] = weekly_closed["macd_line"] - weekly_closed["macd_signal"]
        weekly_closed["macd_hist_slope"] = weekly_closed["macd_hist"].diff()

        return weekly_closed

    @classmethod
    def calculate_daily_indicators(
        cls, df_daily: pd.DataFrame, session_date: date | None = None
    ) -> pd.DataFrame:
        """Calcula Estocástico Lento e Force Index (EMA 2) no diário."""
        df = cls._normalize_ohlcv(df_daily)
        if df.empty:
            return pd.DataFrame()

        if session_date is not None:
            session_dt = _normalize_date(session_date)
            df = df[df.index <= pd.Timestamp(session_dt)]
            if df.empty:
                return pd.DataFrame()

        low14 = df["Low"].rolling(window=14).min()
        high14 = df["High"].rolling(window=14).max()

        denom = (high14 - low14).replace(0, np.nan)
        k_fast = 100.0 * ((df["Close"] - low14) / denom)
        df["stoch_k"] = k_fast.rolling(window=3).mean()
        df["stoch_d"] = df["stoch_k"].rolling(window=3).mean()

        raw_force = df["Close"].diff() * df["Volume"]
        df["force_index_ema2"] = raw_force.ewm(span=2, adjust=False).mean()

        return df

    def evaluate(
        self, ticker: str, df_daily: pd.DataFrame, session_date: date | None = None
    ) -> ScreeningResult | None:
        """Avalia as 3 telas com determinismo temporal estrito."""
        if df_daily is None or df_daily.empty:
            return None

        df = self._normalize_ohlcv(df_daily)
        if df.empty:
            return None

        # Resolução determinística de session_date
        if session_date is not None:
            session_dt = _normalize_date(session_date)
            df = df[df.index <= pd.Timestamp(session_dt)]
            if df.empty:
                return None
        else:
            session_dt = df.index[-1].date()

        # Validação de defasagem temporal com B3Calendar
        last_daily_date = df.index[-1].date()
        lag_trading_days = self.calendar.get_trading_days(last_daily_date, session_dt)
        if lag_trading_days > 5:
            return ScreeningResult(
                ticker=ticker,
                trend_weekly="NEUTRO",
                macd_hist_slope=0.0,
                ema13_weekly_slope=0.0,
                stoch_k=float("nan"),
                stoch_d=float("nan"),
                force_index_ema2=float("nan"),
                wave_daily="NEUTRO",
                trigger_buy_stop=None,
                stop_loss=None,
                target_2r=None,
                risk_r=None,
                signal_status="INSUFFICIENT_DATA",
                diagnostic_reason=(
                    f"Defasagem temporal excessiva: último candle disponível em {last_daily_date} "
                    f"está a {lag_trading_days} pregões de session_date ({session_dt})."
                ),
            )

        # Tela 1: Maré Semanal
        weekly = self.calculate_weekly_indicators(df, session_date=session_dt)
        if len(weekly) < self.min_closed_weeks:
            return ScreeningResult(
                ticker=ticker,
                trend_weekly="NEUTRO",
                macd_hist_slope=0.0,
                ema13_weekly_slope=0.0,
                stoch_k=float("nan"),
                stoch_d=float("nan"),
                force_index_ema2=float("nan"),
                wave_daily="NEUTRO",
                trigger_buy_stop=None,
                stop_loss=None,
                target_2r=None,
                risk_r=None,
                signal_status="INSUFFICIENT_DATA",
                diagnostic_reason=(
                    f"Série histórica insuficiente: requer >= {self.min_closed_weeks} "
                    f"semanas fechadas para aquecimento do MACD (obtidas: {len(weekly)})."
                ),
            )

        daily = self.calculate_daily_indicators(df, session_date=session_dt)
        if len(daily) < 16:
            return ScreeningResult(
                ticker=ticker,
                trend_weekly="NEUTRO",
                macd_hist_slope=0.0,
                ema13_weekly_slope=0.0,
                stoch_k=float("nan"),
                stoch_d=float("nan"),
                force_index_ema2=float("nan"),
                wave_daily="NEUTRO",
                trigger_buy_stop=None,
                stop_loss=None,
                target_2r=None,
                risk_r=None,
                signal_status="INSUFFICIENT_DATA",
                diagnostic_reason=(
                    "Série diária insuficiente para cálculo do Estocástico e Force Index."
                ),
            )

        last_w = weekly.iloc[-1]
        last_d = daily.iloc[-1]
        prev_d = daily.iloc[-2]

        ema_slope = float(last_w["ema13_slope"])
        macd_slope = float(last_w["macd_hist_slope"])

        # Consenso da Maré Semanal
        if ema_slope > 0 and macd_slope > 0:
            trend = "ALTA"
        elif ema_slope < 0 and macd_slope < 0:
            trend = "BAIXA"
        else:
            trend = "NEUTRO"

        # Tela 2: A Onda Diária com Restauração da Zona NEUTRO
        stoch_k = float(last_d["stoch_k"])
        stoch_d = float(last_d["stoch_d"])
        force = float(last_d["force_index_ema2"])
        prev_force = float(prev_d["force_index_ema2"])

        wave = "NEUTRO"
        if trend == "ALTA":
            # Sobrevenda com exaustão vendedora / retomada compradora
            is_oversold = stoch_k < 30.0
            reversal_confirmed = (stoch_k > stoch_d) or (force < 0 and force > prev_force)
            wave = "SOBREVENDA" if is_oversold and reversal_confirmed else "NEUTRO"
        elif trend == "BAIXA":
            # Sobrecompra com exaustão compradora / retomada vendedora
            is_overbought = stoch_k > 70.0
            reversal_confirmed = (stoch_k < stoch_d) or (force > 0 and force < prev_force)
            wave = "SOBRECOMPRA" if is_overbought and reversal_confirmed else "NEUTRO"
        else:
            wave = "NEUTRO"

        # Tela 3: Gatilho Intradiário e Níveis Operacionais 2R
        trigger = None
        stop = None
        target = None
        risk = None
        status = "AGUARDANDO"

        if trend == "ALTA" and wave == "SOBREVENDA":
            buy_trigger = round(float(prev_d["High"]) + self.tick_size, 2)
            pullback_low = min(float(prev_d["Low"]), float(last_d["Low"]))
            stop_calc = round(pullback_low - self.tick_size, 2)

            if stop_calc > 0 and buy_trigger > stop_calc:
                trigger = buy_trigger
                stop = stop_calc
                risk = round(trigger - stop, 2)
                target = round(trigger + 2.0 * risk, 2)
                status = "ARMADO"
            else:
                status = "AGUARDANDO"
                trigger, stop, target, risk = None, None, None, None
        elif trend == "BAIXA" and wave == "SOBRECOMPRA":
            status = "ARMADO_VENDA"
            trigger, stop, target, risk = None, None, None, None
        elif trend in ("ALTA", "BAIXA"):
            status = "AGUARDANDO"
            trigger, stop, target, risk = None, None, None, None
        else:
            status = "BLOQUEADO"
            trigger, stop, target, risk = None, None, None, None

        return ScreeningResult(
            ticker=ticker,
            trend_weekly=trend,
            macd_hist_slope=macd_slope,
            ema13_weekly_slope=ema_slope,
            stoch_k=stoch_k,
            stoch_d=stoch_d,
            force_index_ema2=force,
            wave_daily=wave,
            trigger_buy_stop=trigger,
            stop_loss=stop,
            target_2r=target,
            risk_r=risk,
            signal_status=status,
        )
