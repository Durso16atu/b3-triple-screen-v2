"""Suíte de testes de integração e conformidade para screening."""

from tests.unit.test_screening import (
    test_calculate_daily_indicators,
    test_calculate_weekly_indicators,
    test_column_case_insensitive,
    test_evaluate_bearish_and_neutral,
    test_evaluate_canonical_triple_screen_armed,
    test_screen2_neutral_zone_restoration,
    test_session_date_determinism,
    test_short_week_holiday_anticipation,
    test_statistical_warmup_requirement,
    test_weekly_closed_bar_detection_friday_vs_wednesday,
)

__all__ = [
    "test_calculate_daily_indicators",
    "test_calculate_weekly_indicators",
    "test_column_case_insensitive",
    "test_evaluate_bearish_and_neutral",
    "test_evaluate_canonical_triple_screen_armed",
    "test_screen2_neutral_zone_restoration",
    "test_session_date_determinism",
    "test_short_week_holiday_anticipation",
    "test_statistical_warmup_requirement",
    "test_weekly_closed_bar_detection_friday_vs_wednesday",
]
