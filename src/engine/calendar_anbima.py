from datetime import date

from workalendar.america import BrazilBankCalendar

_cal = BrazilBankCalendar()


def get_workdays(start_date: date | str, end_date: date | str) -> int:
    """
    Calcula os dias úteis (DU) entre start_date (inclusive) e end_date (exclusive)
    considerando o calendário de feriados bancários brasileiros (ANBIMA/B3).
    """
    if isinstance(start_date, str):
        start_date = date.fromisoformat(start_date)
    if isinstance(end_date, str):
        end_date = date.fromisoformat(end_date)

    if end_date <= start_date:
        return 0

    return _cal.get_working_days_delta(start_date, end_date)
