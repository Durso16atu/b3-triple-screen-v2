from datetime import date

from src.engine.calendar_anbima import get_workdays


def test_workdays_same_date():
    assert get_workdays(date(2024, 1, 1), date(2024, 1, 1)) == 0


def test_workdays_normal_week():
    # 2024-03-04 is Monday, 2024-03-08 is Friday
    assert get_workdays("2024-03-04", "2024-03-08") == 4


def test_workdays_with_holiday():
    # Tiradentes 2024 is April 21 (Sunday)
    # Labor Day 2024 is May 1 (Wednesday)
    assert get_workdays("2024-04-30", "2024-05-02") == 1
