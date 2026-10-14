"""Calendário de dias úteis B3/ANBIMA com suporte à Lei 14.759/2023 e vencimentos de opções."""

import functools
from datetime import date, timedelta
from typing import Any


def _normalize_date(d: date | str) -> date:
    """Converte string ISO ou datetime para date puro."""
    if isinstance(d, str):
        return date.fromisoformat(d.split("T")[0])
    if type(d) is not date and hasattr(d, "date"):  # cobre subclasses como datetime
        return d.date()
    return d


def _calc_easter(year: int) -> date:
    """Calcula o Domingo de Páscoa (algoritmo Meeus/Jones/Butcher)."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ll = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ll) // 451
    month = (h + ll - 7 * m + 114) // 31
    day = ((h + ll - 7 * m + 114) % 31) + 1
    return date(year, month, day)


@functools.lru_cache(maxsize=128)
def get_holidays(year: int) -> frozenset[date]:
    """Gera conjunto imutável de feriados B3/ANBIMA para o ano com cache LRU.

    Inclui feriados fixos nacionais, feriados móveis calculados a partir da Páscoa
    (Carnaval -48 e -47 dias, Sexta-Feira Santa -2 dias, Corpus Christi +60 dias)
    e o feriado do Dia Nacional da Consciência Negra (20 de novembro), introduzido
    exclusivamente a partir de 2024 pela Lei 14.759/2023.
    """
    holidays = {date(year, m, d) for m, d in B3Calendar.FIXED_HOLIDAYS}
    if year >= B3Calendar.LEI_14759_START_YEAR:
        holidays.add(date(year, *B3Calendar.CONSCIENCIA_NEGRA))

    pascoa = _calc_easter(year)
    carnaval_seg = pascoa - timedelta(days=48)
    carnaval_ter = pascoa - timedelta(days=47)
    sexta_santa = pascoa - timedelta(days=2)
    corpus_christi = pascoa + timedelta(days=60)

    holidays.update([carnaval_seg, carnaval_ter, sexta_santa, corpus_christi])
    return frozenset(holidays)


class B3Calendar:
    """Motor de feriados bancários e dias úteis da B3."""

    FIXED_HOLIDAYS = {
        (1, 1),  # Confraternização Universal
        (4, 21),  # Tiradentes
        (5, 1),  # Dia do Trabalho
        (9, 7),  # Independência
        (10, 12),  # N. Sra. Aparecida
        (11, 2),  # Finados
        (11, 15),  # Proclamação da República
        (12, 25),  # Natal
    }
    LEI_14759_START_YEAR = 2024
    CONSCIENCIA_NEGRA = (11, 20)

    # Dias sem pregão na B3 além dos feriados nacionais bancários
    B3_NON_TRADING_DAYS = {
        (12, 24),  # Véspera de Natal (sem pregão na B3)
        (12, 31),  # Último dia útil do ano (sem pregão na B3)
    }

    @staticmethod
    def _easter(year: int) -> date:
        """Calcula o Domingo de Páscoa (algoritmo Meeus/Jones/Butcher)."""
        return _calc_easter(year)

    @staticmethod
    def get_holidays(year: int) -> frozenset[date]:
        """Gera todos os feriados B3/ANBIMA para o ano (com cache LRU)."""
        return get_holidays(year)

    def is_working_day(self, d: date | str) -> bool:
        """Verifica se é dia útil segundo a convenção bancária ANBIMA."""
        dt = _normalize_date(d)
        if dt.weekday() >= 5:
            return False
        return dt not in self.get_holidays(dt.year)

    def is_anbima_workday(self, d: date | str) -> bool:
        """Alias explícito para is_working_day (convenção ANBIMA 252)."""
        return self.is_working_day(d)

    def is_trading_day(self, d: date | str) -> bool:
        """Verifica se há sessão de pregão na B3 na data especificada."""
        dt = _normalize_date(d)
        if dt.weekday() >= 5:
            return False
        if dt in self.get_holidays(dt.year):
            return False
        return (dt.month, dt.day) not in self.B3_NON_TRADING_DAYS

    def get_workdays(self, start_date: date | str, end_date: date | str) -> int:
        """Calcula dias úteis ANBIMA no intervalo semi-aberto [start_date, end_date)."""
        start = _normalize_date(start_date)
        end = _normalize_date(end_date)
        if start >= end:
            return 0
        cur = start
        count = 0
        while cur < end:
            if self.is_working_day(cur):
                count += 1
            cur += timedelta(days=1)
        return count

    def get_trading_days(self, start_date: date | str, end_date: date | str) -> int:
        """Calcula dias de pregão B3 no intervalo semi-aberto [start_date, end_date)."""
        start = _normalize_date(start_date)
        end = _normalize_date(end_date)
        if start >= end:
            return 0
        cur = start
        count = 0
        while cur < end:
            if self.is_trading_day(cur):
                count += 1
            cur += timedelta(days=1)
        return count

    def get_option_maturity(self, year: int, month: int) -> date:
        """Regra oficial B3: 3ª sexta-feira do mês de vencimento (antecipa se feriado)."""
        first_day = date(year, month, 1)
        first_friday_day = 1 + (4 - first_day.weekday()) % 7
        third_friday = date(year, month, first_friday_day + 14)

        target = third_friday
        while not self.is_trading_day(target):
            target -= timedelta(days=1)

        return target

    def is_last_trading_day_of_week(self, d: date | str) -> bool:
        """Verifica se a data é o último dia de pregão B3 da respectiva semana."""
        dt = _normalize_date(d)
        if not self.is_trading_day(dt):
            return False
        friday = dt + timedelta(days=(4 - dt.weekday()))
        cur = dt + timedelta(days=1)
        while cur <= friday:
            if self.is_trading_day(cur):
                return False
            cur += timedelta(days=1)
        return True

    def get_previous_trading_day(self, d: date | str) -> date:
        """Retorna o dia de pregão B3 anterior à data informada."""
        cur = _normalize_date(d) - timedelta(days=1)
        while not self.is_trading_day(cur):
            cur -= timedelta(days=1)
        return cur

    def get_active_maturity(self, ref_date: date | str, min_du: int = 5) -> dict[str, Any]:
        """Calcula o vencimento ativo de opções da B3 com rolagem automática.

        Se restarem menos de min_du dias de pregão até o vencimento do mês corrente,
        ou se a data de referência já ultrapassou o vencimento, rola automaticamente
        para o mês subsequente.
        """
        ref_dt = _normalize_date(ref_date)
        cur_year = ref_dt.year
        cur_month = ref_dt.month

        mat_date = self.get_option_maturity(cur_year, cur_month)
        du = self.get_trading_days(ref_dt, mat_date)
        rolled = False

        if du < min_du or ref_dt >= mat_date:
            rolled = True
            if cur_month == 12:
                cur_year += 1
                cur_month = 1
            else:
                cur_month += 1
            mat_date = self.get_option_maturity(cur_year, cur_month)
            du = self.get_trading_days(ref_dt, mat_date)

        return {
            "maturity_date": mat_date,
            "days_to_maturity_du": int(du),
            "call_series": CALL_SERIES[cur_month],
            "put_series": PUT_SERIES[cur_month],
            "rolled": rolled,
        }


CALL_SERIES = {
    1: "A",
    2: "B",
    3: "C",
    4: "D",
    5: "E",
    6: "F",
    7: "G",
    8: "H",
    9: "I",
    10: "J",
    11: "K",
    12: "L",
}

PUT_SERIES = {
    1: "M",
    2: "N",
    3: "O",
    4: "P",
    5: "Q",
    6: "R",
    7: "S",
    8: "T",
    9: "U",
    10: "V",
    11: "W",
    12: "X",
}

_calendar = B3Calendar()


def is_working_day(d: date | str) -> bool:
    """Verifica se é dia útil segundo a convenção bancária ANBIMA."""
    return _calendar.is_working_day(d)


def is_anbima_workday(d: date | str) -> bool:
    """Verifica se é dia útil segundo a convenção bancária ANBIMA."""
    return _calendar.is_anbima_workday(d)


def is_trading_day(d: date | str) -> bool:
    """Verifica se há sessão de pregão na B3 na data informada."""
    return _calendar.is_trading_day(d)


def get_workdays(start_date: date | str, end_date: date | str) -> int:
    """Calcula os dias úteis entre start_date e end_date segundo B3/ANBIMA."""
    return _calendar.get_workdays(start_date, end_date)


def get_trading_days(start_date: date | str, end_date: date | str) -> int:
    """Calcula os dias de pregão B3 entre start_date e end_date."""
    return _calendar.get_trading_days(start_date, end_date)


def get_option_maturity(year: int, month: int) -> date:
    """Calcula a data oficial de vencimento de opções na B3 para o mês/ano."""
    return _calendar.get_option_maturity(year, month)


def is_last_trading_day_of_week(d: date | str) -> bool:
    """Verifica se a data é o último dia de pregão B3 da respectiva semana."""
    return _calendar.is_last_trading_day_of_week(d)


def get_previous_trading_day(d: date | str) -> date:
    """Retorna o dia de pregão B3 anterior à data informada."""
    return _calendar.get_previous_trading_day(d)


def get_active_maturity(ref_date: date | str, min_du: int = 5) -> dict[str, Any]:
    """Calcula o vencimento ativo de opções da B3 com rolagem automática."""
    return _calendar.get_active_maturity(ref_date, min_du)
