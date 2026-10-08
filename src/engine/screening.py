from typing import Literal

import pandas as pd

Trend = Literal["ALTA", "BAIXA", "NEUTRO"]


class TripleScreenFilter:
    @staticmethod
    def screen1_trend(ema_current: float, ema_previous: float, threshold: float = 0.0) -> Trend:
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
