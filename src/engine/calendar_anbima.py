"""Calendário de dias úteis B3/ANBIMA com suporte à Lei 14.759/2023 e vencimentos de opções."""

from datetime import date, timedelta


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
        (11, 20),  # Consciência Negra (Lei 14.759/2023)
        (12, 25),  # Natal
    }

    @staticmethod
    def _easter(year: int) -> date:
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

    def get_holidays(self, year: int) -> set[date]:
        """Gera todos os feriados B3/ANBIMA para o ano."""
        holidays = {date(year, m, d) for m, d in self.FIXED_HOLIDAYS}

        pascoa = self._easter(year)
        carnaval_seg = pascoa - timedelta(days=48)
        carnaval_ter = pascoa - timedelta(days=47)
        sexta_santa = pascoa - timedelta(days=2)
        corpus_christi = pascoa + timedelta(days=60)

        holidays.update([carnaval_seg, carnaval_ter, sexta_santa, corpus_christi])
        return holidays

    def is_working_day(self, d: date | str) -> bool:
        """Verifica se é dia útil na B3."""
        if isinstance(d, str):
            d = date.fromisoformat(d)
        if d.weekday() >= 5:
            return False
        return d not in self.get_holidays(d.year)

    def get_workdays(self, start_date: date | str, end_date: date | str) -> int:
        """Calcula dias úteis no intervalo [start_date, end_date)."""
        if isinstance(start_date, str):
            start_date = date.fromisoformat(start_date)
        if isinstance(end_date, str):
            end_date = date.fromisoformat(end_date)

        if start_date >= end_date:
            return 0
        cur = start_date
        count = 0
        while cur < end_date:
            if self.is_working_day(cur):
                count += 1
            cur += timedelta(days=1)
        return count

    def get_option_maturity(self, year: int, month: int) -> date:
        """Regra oficial B3: 3ª sexta-feira do mês de vencimento (antecipa se feriado)."""
        first_day = date(year, month, 1)
        first_friday_day = 1 + (4 - first_day.weekday()) % 7
        third_friday = date(year, month, first_friday_day + 14)

        target = third_friday
        while not self.is_working_day(target):
            target -= timedelta(days=1)

        return target


_calendar = B3Calendar()


def get_workdays(start_date: date | str, end_date: date | str) -> int:
    """Calcula os dias úteis entre start_date e end_date segundo B3/ANBIMA."""
    return _calendar.get_workdays(start_date, end_date)


def get_option_maturity(year: int, month: int) -> date:
    """Calcula a data oficial de vencimento de opções na B3 para o mês/ano."""
    return _calendar.get_option_maturity(year, month)
