"""Suíte de testes de integração e conformidade para calendar_anbima."""

from tests.unit.test_calendar import (
    test_consciencia_negra_holiday_lei_14759,
    test_datetime_and_string_normalization,
    test_easter_and_mobile_holidays_accuracy,
    test_get_option_maturity_november_2026_anticipation,
    test_get_option_maturity_regular_month,
    test_get_workdays_exact_calculation,
    test_lei_14759_historical_validity,
    test_lru_cache_determinism,
    test_no_workalendar_dependency,
    test_separation_anbima_workday_vs_b3_trading_day,
    test_workdays_normal_week,
    test_workdays_same_date,
    test_workdays_with_holiday,
)

__all__ = [
    "test_consciencia_negra_holiday_lei_14759",
    "test_datetime_and_string_normalization",
    "test_easter_and_mobile_holidays_accuracy",
    "test_get_option_maturity_november_2026_anticipation",
    "test_get_option_maturity_regular_month",
    "test_get_workdays_exact_calculation",
    "test_lei_14759_historical_validity",
    "test_lru_cache_determinism",
    "test_no_workalendar_dependency",
    "test_separation_anbima_workday_vs_b3_trading_day",
    "test_workdays_normal_week",
    "test_workdays_same_date",
    "test_workdays_with_holiday",
]
