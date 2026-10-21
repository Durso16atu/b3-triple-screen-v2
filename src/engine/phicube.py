"""Motor matemático fractal PhiCube (Bo Williams, Fernando Góes & André Moraes) para a B3.

Fórmulas extraídas por engenharia reversa determinística de dum-unescaped.js:
- HFMA / EMA PhiCube: alpha = 2 / (1 + N)
- DMIMA (MIMA Deslocada): 2 * EMA(F * 2.0581) - EMA(F * 4.236)
- Santo Banda: Acumulador triplo de desvios Close - DMIMA(F), Close - DMIMA(F/2) e 2*(Close - EMA)
  suavizado por cascata quadrupla de DEMAs (alphas 2/3, 2/5, 2/9) e bandas (2.118x e 4.236x).
- Caiu Comprou / Levantou Cortou (PriceShooter - Fernando Góes): retração de 78.6% e 21.4%
  do canal Donchian fractal (17, 72, 305).
- Smart MA (PriceShooter): escada contínua sobre o corpo do candle (max/min entre Open e Close).
- PSBanda (Fernando Góes): Sinal EMA(4) vs Bandas EMA(17) e EMA(72).
- Difusor (André Moraes): EMA(21) - EMA(55) suavizado por EMA(34) e EMA(89).
- Phibo Auto-Targets: retrações e projeções áureas (61.8%, 100%, 161.8%) sobre o swing de 72 barras.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class PhiCubeResult:
    ticker: str
    mima_alignment_score: int  # 0 a 5 (M17 > M34 > M72 > M144 > M305 + Close > M17)
    mima_fan_state: str  # 'LEQUE_ALTA', 'LEQUE_BAIXA', 'CONSOLIDACAO'
    grande_tacada_aligned: bool  # Fernando Góes (M8 > M34 > M144 e Close > M34)
    santo_17_state: str  # 'ALTA', 'BAIXA', 'NEUTRO'
    santo_72_state: str  # 'ALTA', 'BAIXA', 'NEUTRO'
    santo_305_state: str  # 'ALTA', 'BAIXA', 'NEUTRO'
    pv_pc_rule: str  # 'PV_PROIBIDO_VENDER', 'PC_PROIBIDO_COMPRAR', 'NEUTRO'
    caiu_comprou_72: float | None
    levantou_cortou_72: float | None
    smart_ma_upper: float | None
    smart_ma_lower: float | None
    psbanda_state: str  # 'COMPRA', 'VENDA', 'NEUTRO'
    difusor_state: str  # 'ALTA', 'BAIXA'
    phibo_direction: str  # 'ALTA', 'BAIXA'
    phibo_swing_low: float
    phibo_swing_high: float
    phibo_618: float
    phibo_100: float
    phibo_1618: float
    confluence_verdict: str  # 'FORTE_COMPRA', 'COMPRA_PULLBACK', 'NEUTRO', 'VENDA'


def calc_hfma(series: pd.Series, length: float) -> pd.Series:
    """EMA exata do motor PhiCube (a0_0x226992): alpha = 2 / (1 + length)."""
    vals = series.to_numpy(dtype=float)
    n = len(vals)
    if n == 0:
        return series.copy()
    alpha = 2.0 / (1.0 + max(1.0, float(length)))
    out = np.empty(n, dtype=float)
    out[0] = vals[0]
    for i in range(1, n):
        if np.isnan(vals[i]):
            out[i] = out[i - 1]
        elif np.isnan(out[i - 1]):
            out[i] = vals[i]
        else:
            out[i] = (vals[i] - out[i - 1]) * alpha + out[i - 1]
    return pd.Series(out, index=series.index)


def calc_dmima(series: pd.Series, fractal: int) -> pd.Series:
    """DMIMA (a0_0x12ff2a): DEMA áurea 2 * EMA(F * 2.0581) - EMA(F * 4.236)."""
    ema_fast = calc_hfma(series, fractal * 2.0581)
    ema_mid = calc_hfma(series, fractal * 4.236)
    return 2.0 * ema_fast - ema_mid


def _dema_alpha(vals: np.ndarray, a_fast: float, a_slow: float) -> np.ndarray:
    """Passagem dupla EMA (2 * e_fast - e_slow) usada no Santo Banda."""
    n = len(vals)
    if n == 0:
        return np.array([], dtype=float)
    ef = np.empty(n, dtype=float)
    es = np.empty(n, dtype=float)
    out = np.empty(n, dtype=float)
    ef[0] = vals[0]
    es[0] = vals[0]
    out[0] = vals[0]
    for i in range(1, n):
        ef[i] = (vals[i] - ef[i - 1]) * a_fast + ef[i - 1]
        es[i] = (vals[i] - es[i - 1]) * a_slow + es[i - 1]
        out[i] = 2.0 * ef[i] - es[i]
    return out


def calc_santo_state(close: pd.Series, fractal_p: int = 17) -> pd.Series:
    """Retorna série de estados ('ALTA', 'BAIXA', 'NEUTRO') para o Santo de período fractal_p."""
    n = len(close)
    if n < 5:
        return pd.Series(["NEUTRO"] * n, index=close.index)

    half_p = int(np.ceil(fractal_p / 2.0))
    mima_f = calc_dmima(close, fractal_p).to_numpy(dtype=float)
    mima_h = calc_dmima(close, half_p).to_numpy(dtype=float)
    ema_h = calc_hfma(close, half_p).to_numpy(dtype=float)
    c_vals = close.to_numpy(dtype=float)

    s0 = np.zeros(n, dtype=float)
    start_bar = min(int(fractal_p * 4.236), max(1, n // 3))
    for i in range(start_bar, n):
        delta = (c_vals[i] - mima_f[i]) + (c_vals[i] - mima_h[i]) + 2.0 * (c_vals[i] - ema_h[i])
        s0[i] = s0[i - 1] + delta

    a2 = 2.0 / 3.0
    a4 = 2.0 / 5.0
    a8 = 2.0 / 9.0
    a_r1 = 2.0 / (1.0 + fractal_p * 2.118)
    a_r2 = 2.0 / (1.0 + fractal_p * 4.236)
    slow_b = fractal_p * 4
    a_l1 = 2.0 / (1.0 + slow_b * 2.118)
    a_l2 = 2.0 / (1.0 + slow_b * 4.236)

    s1 = _dema_alpha(s0, a2, a4)
    s2 = _dema_alpha(s1, a2, a4)
    s3 = _dema_alpha(s2, a4, a8)

    santo_line = _dema_alpha(s3, a2, a4)
    sm_rapido = _dema_alpha(s3, a_r1, a_r2)
    sm_lento = _dema_alpha(s3, a_l1, a_l2)
    mid_band = (sm_rapido + sm_lento) / 2.0

    states = ["NEUTRO"] * n
    for i in range(1, n):
        if s3[i] > s3[i - 1] and santo_line[i] > mid_band[i]:
            states[i] = "ALTA"
        elif s3[i] < s3[i - 1] and santo_line[i] < mid_band[i]:
            states[i] = "BAIXA"
    return pd.Series(states, index=close.index)


def calc_caiu_comprou_series(
    high: pd.Series, low: pd.Series, period: int = 72
) -> tuple[pd.Series, pd.Series]:
    """Calcula as linhas de Caiu Comprou (78.6%) e Levantou Cortou (21.4%) de período `period`."""
    hh = high.rolling(window=period, min_periods=max(5, period // 3)).max()
    ll = low.rolling(window=period, min_periods=max(5, period // 3)).min()
    cc = ll + 0.786 * (hh - ll)
    lc = ll + 0.214 * (hh - ll)
    return cc, lc


def calc_smart_ma_series(open_s: pd.Series, close_s: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Calcula a escada contínua Smart MA PriceShooter (a0_0x6e6816) sobre o corpo dos candles."""
    o_vals = open_s.to_numpy(dtype=float)
    c_vals = close_s.to_numpy(dtype=float)
    body_hi = np.maximum(o_vals, c_vals)
    body_lo = np.minimum(o_vals, c_vals)

    n = len(c_vals)
    upper = np.empty(n, dtype=float)
    lower = np.empty(n, dtype=float)
    if n == 0:
        return open_s.copy(), close_s.copy()

    upper[0] = body_hi[0]
    lower[0] = body_lo[0]
    for i in range(1, n):
        upper[i] = body_hi[i] if body_hi[i] <= upper[i - 1] else max(upper[i - 1], body_lo[i])
        lower[i] = body_lo[i] if body_lo[i] >= lower[i - 1] else min(lower[i - 1], body_hi[i])

    return pd.Series(upper, index=close_s.index), pd.Series(lower, index=close_s.index)


class PhiCubeFilter:
    """Avaliador unificado dos modelos Bo Williams, Fernando Góes e André Moraes."""

    @staticmethod
    def enrich_ohlc_dataframe(df_daily: pd.DataFrame) -> pd.DataFrame:
        """Adiciona colunas fractais PhiCube ao DataFrame diário para ohlc_history."""
        df = df_daily.copy()
        if df.empty:
            return df

        close = df["Close"]
        high = df["High"]
        low = df["Low"]
        open_s = df["Open"]

        df["mima8"] = calc_dmima(close, 8)
        df["mima17"] = calc_dmima(close, 17)
        df["mima34"] = calc_dmima(close, 34)
        df["mima72"] = calc_dmima(close, 72)
        df["mima144"] = calc_dmima(close, 144)
        df["mima305"] = calc_dmima(close, 305)

        cc72, lc72 = calc_caiu_comprou_series(high, low, period=72)
        df["pv_support"] = cc72
        df["pc_resist"] = lc72

        sm_up, sm_lo = calc_smart_ma_series(open_s, close)
        df["smart_upper"] = sm_up
        df["smart_lower"] = sm_lo

        return df

    def evaluate(self, ticker: str, df_daily: pd.DataFrame) -> PhiCubeResult:
        """Calcula todos os indicadores PhiCube para o último pregão disponível do ativo."""
        df = self.enrich_ohlc_dataframe(df_daily)
        close = df["Close"]
        high = df["High"]
        low = df["Low"]

        spot = float(close.iloc[-1])
        m8 = float(df["mima8"].iloc[-1])
        m17 = float(df["mima17"].iloc[-1])
        m34 = float(df["mima34"].iloc[-1])
        m72 = float(df["mima72"].iloc[-1])
        m144 = float(df["mima144"].iloc[-1])
        m305 = float(df["mima305"].iloc[-1])

        # 1. Alinhamento do Leque MIMA (0 a 5)
        score = (
            (1 if spot > m17 else 0)
            + (1 if m17 > m34 else 0)
            + (1 if m34 > m72 else 0)
            + (1 if m72 > m144 else 0)
            + (1 if m144 > m305 else 0)
        )
        if score >= 4:
            fan_state = "LEQUE_ALTA"
        elif score <= 1:
            fan_state = "LEQUE_BAIXA"
        else:
            fan_state = "CONSOLIDACAO"

        # 2. Setup Fernando Góes - A Grande Tacada (MIMA 8 > 34 > 144 e Spot >= M34)
        grande_tacada = bool(m8 > m34 and m34 > m144 and spot >= m34 * 0.995)

        # 3. Santo Banda nos 3 fractais operacionais (17, 72, 305)
        s17_state = str(calc_santo_state(close, 17).iloc[-1])
        s72_state = str(calc_santo_state(close, 72).iloc[-1])
        s305_state = str(calc_santo_state(close, 305).iloc[-1])

        # 4. Caiu Comprou / Levantou Cortou (72) e Regra PV/PC
        cc72_val = float(df["pv_support"].iloc[-1])
        lc72_val = float(df["pc_resist"].iloc[-1])
        cc17_s, lc17_s = calc_caiu_comprou_series(high, low, period=17)
        cc17_val = float(cc17_s.iloc[-1])
        lc17_val = float(lc17_s.iloc[-1])

        last_high = float(high.iloc[-1])
        last_low = float(low.iloc[-1])

        pv_active = last_high >= cc72_val * 0.998 and cc17_val >= cc72_val * 0.99
        pc_active = last_low <= lc72_val * 1.002 and lc17_val <= lc72_val * 1.01

        if pv_active and not pc_active:
            pv_pc_rule = "PV_PROIBIDO_VENDER"
        elif pc_active and not pv_active:
            pv_pc_rule = "PC_PROIBIDO_COMPRAR"
        elif spot >= cc72_val:
            pv_pc_rule = "PV_PROIBIDO_VENDER"
        elif spot <= lc72_val:
            pv_pc_rule = "PC_PROIBIDO_COMPRAR"
        else:
            pv_pc_rule = "NEUTRO"

        # 5. Smart MA PriceShooter
        sm_up = round(float(df["smart_upper"].iloc[-1]), 2)
        sm_lo = round(float(df["smart_lower"].iloc[-1]), 2)

        # 6. PSBanda (Fernando Góes: Sinal EMA 4 vs EMA 17 e EMA 72)
        ps_sig = calc_hfma(close, 4)
        ps_fast = calc_hfma(close, 17)
        ps_slow = calc_hfma(close, 72)
        sig_now = float(ps_sig.iloc[-1])
        sig_prev = float(ps_sig.iloc[-2]) if len(ps_sig) >= 2 else sig_now
        f_now = float(ps_fast.iloc[-1])
        s_now = float(ps_slow.iloc[-1])

        if sig_now > sig_prev and sig_now > f_now and f_now > s_now:
            psbanda_state = "COMPRA"
        elif sig_now < sig_prev and sig_now < f_now and f_now < s_now:
            psbanda_state = "VENDA"
        else:
            psbanda_state = "NEUTRO"

        # 7. Difusor André Moraes (EMA 21 - EMA 55 vs EMA 34)
        dif_rapido = calc_hfma(close, 21) - calc_hfma(close, 55)
        dif_medio = calc_hfma(dif_rapido, 34)
        is_dif_up = float(dif_rapido.iloc[-1]) >= float(dif_medio.iloc[-1])
        difusor_state = "ALTA" if is_dif_up else "BAIXA"

        # 8. Alvos Automáticos Phibo (61.8%, 100%, 161.8%) sobre o swing de 72 barras
        window_df = df.iloc[-min(72, len(df)) :]
        swing_high = float(window_df["High"].max())
        swing_low = float(window_df["Low"].min())
        idx_high = window_df["High"].values.argmax()
        idx_low = window_df["Low"].values.argmin()
        rng = max(0.10, swing_high - swing_low)

        if idx_low <= idx_high:
            # Swing de Alta: projeta alvos acima do piso
            phibo_dir = "ALTA"
            p618 = round(swing_low + 0.618 * rng, 2)
            p100 = round(swing_high, 2)
            p1618 = round(swing_low + 1.618 * rng, 2)
        else:
            # Swing Corretivo: projeta alvos de retomada a partir do fundo recente
            phibo_dir = "ALTA" if score >= 3 else "BAIXA"
            if phibo_dir == "ALTA":
                p618 = round(swing_low + 0.618 * rng, 2)
                p100 = round(swing_high, 2)
                p1618 = round(swing_low + 1.618 * rng, 2)
            else:
                p618 = round(swing_high - 0.618 * rng, 2)
                p100 = round(swing_low, 2)
                p1618 = round(max(0.01, swing_high - 1.618 * rng), 2)

        # 9. Veredito de Confluência
        if score >= 4 and (pv_pc_rule == "PV_PROIBIDO_VENDER" or s72_state == "ALTA"):
            verdict = "FORTE_COMPRA"
        elif score >= 3 and spot >= cc72_val * 0.97:
            verdict = "COMPRA_PULLBACK"
        elif score <= 1 and pv_pc_rule == "PC_PROIBIDO_COMPRAR":
            verdict = "VENDA"
        else:
            verdict = "NEUTRO"

        return PhiCubeResult(
            ticker=ticker,
            mima_alignment_score=int(score),
            mima_fan_state=fan_state,
            grande_tacada_aligned=grande_tacada,
            santo_17_state=s17_state,
            santo_72_state=s72_state,
            santo_305_state=s305_state,
            pv_pc_rule=pv_pc_rule,
            caiu_comprou_72=round(cc72_val, 2),
            levantou_cortou_72=round(lc72_val, 2),
            smart_ma_upper=sm_up,
            smart_ma_lower=sm_lo,
            psbanda_state=psbanda_state,
            difusor_state=difusor_state,
            phibo_direction=phibo_dir,
            phibo_swing_low=round(swing_low, 2),
            phibo_swing_high=round(swing_high, 2),
            phibo_618=p618,
            phibo_100=p100,
            phibo_1618=p1618,
            confluence_verdict=verdict,
        )
