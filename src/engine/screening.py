"""Motor de triagem quantitativa Triple Screen (Alexander Elder) para B3."""

from dataclasses import dataclass

import numpy as np
import pandas as pd


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
    signal_status: str  # 'ARMADO', 'AGUARDANDO', 'BLOQUEADO'


class TripleScreenFilter:
    """Implementação do Triple Screen de Alexander Elder com restrição anti-lookahead."""

    def __init__(self, tick_size: float = 0.01):
        self.tick_size = tick_size

    @staticmethod
    def calculate_weekly_indicators(df_daily: pd.DataFrame) -> pd.DataFrame:
        """Gera barras semanais fechadas (W-FRI) excluindo semana incompleta."""
        df = df_daily.copy()
        cols = {
            c: c.capitalize()
            for c in df.columns
            if str(c).lower() in ["open", "high", "low", "close", "volume"]
        }
        if cols:
            df = df.rename(columns=cols)

        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)

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

        # Maré Semanal: EMA 13
        weekly["ema13"] = weekly["Close"].ewm(span=13, adjust=False).mean()
        weekly["ema13_slope"] = weekly["ema13"].diff()

        # Maré Semanal: MACD Histograma (12, 26, 9)
        ema12 = weekly["Close"].ewm(span=12, adjust=False).mean()
        ema26 = weekly["Close"].ewm(span=26, adjust=False).mean()
        weekly["macd_line"] = ema12 - ema26
        weekly["macd_signal"] = weekly["macd_line"].ewm(span=9, adjust=False).mean()
        weekly["macd_hist"] = weekly["macd_line"] - weekly["macd_signal"]
        weekly["macd_hist_slope"] = weekly["macd_hist"].diff()

        return weekly

    @staticmethod
    def calculate_daily_indicators(df_daily: pd.DataFrame) -> pd.DataFrame:
        """Calcula Estocástico Lento e Force Index (EMA 2) no diário."""
        df = df_daily.copy()
        cols = {
            c: c.capitalize()
            for c in df.columns
            if str(c).lower() in ["open", "high", "low", "close", "volume"]
        }
        if cols:
            df = df.rename(columns=cols)

        low14 = df["Low"].rolling(window=14).min()
        high14 = df["High"].rolling(window=14).max()

        k_fast = 100 * ((df["Close"] - low14) / (high14 - low14).replace(0, np.nan))
        df["stoch_k"] = k_fast.rolling(window=3).mean()
        df["stoch_d"] = df["stoch_k"].rolling(window=3).mean()

        raw_force = df["Close"].diff() * df["Volume"]
        df["force_index_ema2"] = raw_force.ewm(span=2, adjust=False).mean()

        return df

    def evaluate(self, ticker: str, df_daily: pd.DataFrame) -> ScreeningResult | None:
        """Avalia as 3 telas e gera trigger, stop e alvo 2R exato."""
        if len(df_daily) < 60:
            return None

        weekly = self.calculate_weekly_indicators(df_daily)
        if len(weekly) < 3:
            return None

        daily = self.calculate_daily_indicators(df_daily)

        last_w = weekly.iloc[-2] if len(weekly) >= 2 else weekly.iloc[-1]
        last_d = daily.iloc[-1]
        prev_d = daily.iloc[-2]

        ema_slope = float(last_w["ema13_slope"])
        macd_slope = float(last_w["macd_hist_slope"])

        # Tela 1: A Maré
        if ema_slope > 0 and macd_slope > 0:
            trend = "ALTA"
        elif ema_slope < 0 and macd_slope < 0:
            trend = "BAIXA"
        else:
            trend = "NEUTRO"

        # Tela 2: A Onda
        stoch_k = float(last_d["stoch_k"])
        stoch_d = float(last_d["stoch_d"])
        force = float(last_d["force_index_ema2"])

        if stoch_k < 25 or force < 0:
            wave = "SOBREVENDA"
        elif stoch_k > 75 or force > 0:
            wave = "SOBRECOMPRA"
        else:
            wave = "NEUTRO"

        # Tela 3: Gatilho Intradiário e Risco 2R
        trigger = None
        stop = None
        target = None
        risk = None
        status = "BLOQUEADO"

        if trend == "ALTA":
            if wave == "SOBREVENDA":
                trigger = round(float(prev_d["High"]) + self.tick_size, 2)
                recent_low = min(float(prev_d["Low"]), float(last_d["Low"]))
                stop = round(recent_low - self.tick_size, 2)

                if trigger > stop:
                    risk = round(trigger - stop, 2)
                    target = round(trigger + 2.0 * risk, 2)
                    status = "ARMADO"
                else:
                    status = "AGUARDANDO"
            else:
                status = "AGUARDANDO"

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

    # Métodos legados mantidos para compatibilidade com a suíte de testes
    @staticmethod
    def screen1_trend(ema_current: float, ema_previous: float, threshold: float = 0.0) -> str:
        diff = ema_current - ema_previous
        if diff > threshold:
            return "ALTA"
        elif diff < -threshold:
            return "BAIXA"
        return "NEUTRO"

    @staticmethod
    def screen2_elder_ray(high: float, low: float, ema_daily: float) -> tuple[float, float]:
        bull_power = high - ema_daily
        bear_power = low - ema_daily
        return bull_power, bear_power

    @staticmethod
    def screen3_select_options(
        options_df: pd.DataFrame,
        min_du: int = 15,
        max_du: int = 45,
        min_delta: float = 0.15,
        max_delta: float = 0.35,
        is_call: bool = True,
    ) -> pd.DataFrame:
        df = options_df.copy()
        df = df[(df["du"] >= min_du) & (df["du"] <= max_du)]

        if is_call:
            df = df[(df["delta"] >= min_delta) & (df["delta"] <= max_delta)]
        else:
            df = df[(df["delta"] >= -max_delta) & (df["delta"] <= -min_delta)]

        return df
