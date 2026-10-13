from datetime import date

from src.engine.calendar_anbima import B3Calendar, get_option_maturity, get_workdays


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
    # Between 2026-10-13 and 2026-11-19 (maturity)
    # Contains 2/11 (Finados, Mon) and 15/11 (Proclamação, Sun)
    du = get_workdays("2026-10-13", "2026-11-19")
    assert du == 26
    assert get_workdays("2026-11-19", "2026-10-13") == 0
