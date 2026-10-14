import sys
from datetime import date, datetime

from src.engine.calendar_anbima import (
    B3Calendar,
    get_active_maturity,
    get_holidays,
    get_option_maturity,
    get_trading_days,
    get_workdays,
    is_anbima_workday,
    is_trading_day,
    is_working_day,
)


def test_no_workalendar_dependency():
    """Garante que o módulo de calendário não utiliza ou requer o pacote workalendar."""
    assert "workalendar" not in sys.modules
    with open("requirements.txt") as f:
        content = f.read()
    assert "workalendar" not in content


def test_workdays_same_date():
    assert get_workdays(date(2024, 1, 1), date(2024, 1, 1)) == 0


def test_workdays_normal_week():
    # 2024-03-04 is Monday, 2024-03-08 is Friday
    assert get_workdays("2024-03-04", "2024-03-08") == 4


def test_workdays_with_holiday():
    # Tiradentes 2024 is April 21 (Sunday)
    # Labor Day 2024 is May 1 (Wednesday)
    assert get_workdays("2024-04-30", "2024-05-02") == 1


def test_consciencia_negra_holiday_lei_14759():
    cal = B3Calendar()
    # 20/11/2026 is Friday, must be recognized as national holiday
    assert not cal.is_working_day(date(2026, 11, 20))
    assert not cal.is_working_day("2026-11-20")
    # Day before (Thursday 19/11/2026) is a working day
    assert cal.is_working_day(date(2026, 11, 19))


def test_lei_14759_historical_validity():
    """Verifica que o feriado de 20/11 é estritamente válido apenas para year >= 2024."""
    cal = B3Calendar()

    # Em 2023 (antes da vigência da Lei 14.759/2023), 20/11 foi segunda-feira e dia útil
    nov_20_2023 = date(2023, 11, 20)
    assert nov_20_2023 not in cal.get_holidays(2023)
    assert cal.is_working_day(nov_20_2023)
    assert cal.is_trading_day(nov_20_2023)

    # A partir de 2024, 20/11 é feriado nacional permanente
    nov_20_2024 = date(2024, 11, 20)
    assert nov_20_2024 in cal.get_holidays(2024)
    assert not cal.is_working_day(nov_20_2024)
    assert not cal.is_trading_day(nov_20_2024)

    # Em 2026, 20/11 é sexta-feira e feriado nacional
    nov_20_2026 = date(2026, 11, 20)
    assert nov_20_2026 in cal.get_holidays(2026)
    assert not cal.is_working_day(nov_20_2026)
    assert not cal.is_working_day("2026-11-20")
    assert not cal.is_trading_day(nov_20_2026)
    assert cal.is_working_day(date(2026, 11, 19))


def test_lru_cache_determinism():
    """Valida que get_holidays utiliza cache determinístico com frozenset."""
    get_holidays.cache_clear()
    h1 = get_holidays(2026)
    assert isinstance(h1, frozenset)

    cal = B3Calendar()
    h2 = cal.get_holidays(2026)
    assert h1 is h2

    info = get_holidays.cache_info()
    assert info.hits >= 1


def test_easter_and_mobile_holidays_accuracy():
    """Testa a precisão dos feriados móveis calculados por Meeus/Jones/Butcher."""
    cal = B3Calendar()
    # 2024: Páscoa em 31/03/2024
    h2024 = cal.get_holidays(2024)
    assert date(2024, 2, 12) in h2024  # Carnaval Seg
    assert date(2024, 2, 13) in h2024  # Carnaval Ter
    assert date(2024, 3, 29) in h2024  # Sexta-Feira Santa
    assert date(2024, 5, 30) in h2024  # Corpus Christi

    # 2026: Páscoa em 05/04/2026
    h2026 = cal.get_holidays(2026)
    assert date(2026, 2, 16) in h2026  # Carnaval Seg
    assert date(2026, 2, 17) in h2026  # Carnaval Ter
    assert date(2026, 4, 3) in h2026  # Sexta-Feira Santa
    assert date(2026, 6, 4) in h2026  # Corpus Christi


def test_separation_anbima_workday_vs_b3_trading_day():
    """Verifica a separação estrita entre convenção ANBIMA (DU de taxas) e Pregão B3."""
    cal = B3Calendar()

    # 24/12/2026 é quinta-feira: dia útil bancário ANBIMA, mas sem pregão na B3
    d_24_12 = date(2026, 12, 24)
    assert cal.is_working_day(d_24_12)
    assert cal.is_anbima_workday(d_24_12)
    assert is_anbima_workday(d_24_12)
    assert is_working_day(d_24_12)
    assert not cal.is_trading_day(d_24_12)
    assert not is_trading_day(d_24_12)

    # 31/12/2026 é quinta-feira: dia útil bancário ANBIMA, mas sem pregão na B3
    d_31_12 = date(2026, 12, 31)
    assert cal.is_working_day(d_31_12)
    assert not cal.is_trading_day(d_31_12)

    # Semana de 21/12 a 26/12/2026:
    # Seg 21, Ter 22, Qua 23, Qui 24, Sex 25 (Natal)
    # Dias úteis ANBIMA: 21, 22, 23, 24 = 4
    # Dias de pregão B3: 21, 22, 23 = 3
    assert get_workdays("2026-12-21", "2026-12-26") == 4
    assert get_trading_days("2026-12-21", "2026-12-26") == 3


def test_datetime_and_string_normalization():
    """Garante compatibilidade robusta com objetos datetime e strings ISO."""
    cal = B3Calendar()
    dt_holiday = datetime(2026, 11, 20, 14, 30)
    dt_workday = datetime(2026, 11, 19, 10, 0)

    assert not cal.is_working_day(dt_holiday)
    assert cal.is_working_day(dt_workday)
    assert not cal.is_trading_day(dt_holiday)
    assert cal.is_trading_day(dt_workday)


def test_get_option_maturity_november_2026_anticipation():
    # November 2026: 3rd Friday is 20/11 (holiday), must anticipate to 19/11
    mat_2026_11 = get_option_maturity(2026, 11)
    assert mat_2026_11 == date(2026, 11, 19)

    cal = B3Calendar()
    assert cal.get_option_maturity(2026, 11) == date(2026, 11, 19)


def test_get_option_maturity_regular_month():
    # October 2026: 1st is Thu, 1st Fri is 2/10, 2nd Fri is 9/10, 3rd Fri is 16/10
    mat_2026_10 = get_option_maturity(2026, 10)
    assert mat_2026_10 == date(2026, 10, 16)


def test_get_workdays_exact_calculation():
    # Contains 2/11 (Finados, Mon) and 15/11 (Proclamação, Sun)
    du = get_workdays("2026-10-13", "2026-11-19")
    assert du == 26
    assert get_workdays("2026-11-19", "2026-10-13") == 0


def test_get_active_maturity_rules():
    """Valida a regra de rolagem automática quando dias úteis < min_du e séries B3."""
    cal = B3Calendar()

    # Em 14/10/2026: vencimento de outubro é 16/10 (2 DU < 5 DU) -> Rola para novembro
    act_nov = cal.get_active_maturity("2026-10-14", min_du=5)
    assert get_active_maturity("2026-10-14", min_du=5) == act_nov
    assert act_nov["maturity_date"] == date(2026, 11, 19)
    assert act_nov["call_series"] == "K"
    assert act_nov["put_series"] == "W"
    assert act_nov["rolled"] is True
    assert act_nov["days_to_maturity_du"] == 25

    # Em 01/10/2026: restam 10 DU (>= 5 DU) -> Mantém outubro
    act_oct = cal.get_active_maturity("2026-10-01", min_du=5)
    assert act_oct["maturity_date"] == date(2026, 10, 16)
    assert act_oct["call_series"] == "J"
    assert act_oct["put_series"] == "V"
    assert act_oct["rolled"] is False

    # Em 15/12/2026: restam 3 DU até 18/12 -> Rola para Janeiro/2027
    act_jan = cal.get_active_maturity("2026-12-15", min_du=5)
    assert act_jan["maturity_date"] == date(2027, 1, 15)
    assert act_jan["call_series"] == "A"
    assert act_jan["put_series"] == "M"
    assert act_jan["rolled"] is True
