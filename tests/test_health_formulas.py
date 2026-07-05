"""Direct unit tests for body-composition threshold helpers.

These are pure functions (no DB, no HTTP, no auth) — they encode medical
category boundaries, so we test the exact edges where an off-by-one would
silently mislabel a user. Complements test_health.py which exercises the
same logic through the API endpoint.
"""
import pytest

from app.api.v1.endpoints.health import (
    _bmi_category,
    _whtr_category,
    _ffmi_category,
)


# --- BMI: boundaries 16 / 17 / 18.5 / 25 / 30 / 35 / 40 ---
@pytest.mark.parametrize("bmi, expected", [
    (15.9, "severe_thin"),
    (16.0, "moderate_thin"),
    (16.9, "moderate_thin"),
    (17.0, "mild_thin"),
    (18.4, "mild_thin"),
    (18.5, "normal"),
    (24.9, "normal"),
    (25.0, "overweight"),
    (29.9, "overweight"),
    (30.0, "obese1"),
    (34.9, "obese1"),
    (35.0, "obese2"),
    (39.9, "obese2"),
    (40.0, "obese3"),
])
def test_bmi_category_boundaries(bmi, expected):
    assert _bmi_category(bmi, None)["category"] == expected


@pytest.mark.parametrize("bmi, activity, expected_note", [
    (27.0, "high", True),       # overweight + athlete -> muscle-mass note
    (27.0, "very_high", True),
    (27.0, "extreme", True),
    (27.0, "low", False),       # overweight but not athlete
    (27.0, None, False),
    (32.0, "extreme", True),    # obese1 also carries muscle_mass note
    (37.0, "high", False),      # obese2 has no muscle note regardless of athlete
    (22.0, "high", False),      # normal range: no note even for athlete
])
def test_bmi_athlete_note(bmi, activity, expected_note):
    assert _bmi_category(bmi, activity)["athlete_note"] is expected_note


# --- WHtR: Ashwell & Hsieh 2005 thresholds 0.40 / 0.50 / 0.60 ---
@pytest.mark.parametrize("whtr, cat, risk", [
    (0.39, "underweight", "low"),
    (0.40, "healthy", "low"),
    (0.49, "healthy", "low"),
    (0.50, "increased_risk", "moderate"),
    (0.59, "increased_risk", "moderate"),
    (0.60, "high_risk", "high"),
    (0.75, "high_risk", "high"),
])
def test_whtr_category(whtr, cat, risk):
    r = _whtr_category(whtr)
    assert r["category"] == cat
    assert r["risk"] == risk


# --- FFMI: Kouri 1995, sex-specific benchmarks ---
@pytest.mark.parametrize("ffmi, expected", [
    (13.9, "below_avg"),
    (14.0, "average"),
    (16.9, "average"),
    (17.0, "above_avg"),
    (18.9, "above_avg"),
    (19.0, "excellent"),
    (20.9, "excellent"),
    (21.0, "exceptional"),
])
def test_ffmi_female(ffmi, expected):
    r = _ffmi_category(ffmi, "female")
    assert r["category"] == expected
    assert r["natural_ceiling"] == 22


@pytest.mark.parametrize("ffmi, expected", [
    (15.9, "below_avg"),
    (16.0, "average"),
    (17.9, "average"),
    (18.0, "above_avg"),
    (19.9, "above_avg"),
    (20.0, "excellent"),
    (21.9, "excellent"),
    (22.0, "elite"),
    (24.9, "elite"),
    (25.0, "exceptional"),
])
def test_ffmi_male(ffmi, expected):
    r = _ffmi_category(ffmi, "male")
    assert r["category"] == expected
    assert r["natural_ceiling"] == 25


def test_ffmi_unknown_sex_defaults_to_male():
    # sex=None must fall back to male thresholds + male ceiling
    assert _ffmi_category(17.0, None)["category"] == "average"   # male: <18 -> average
    assert _ffmi_category(17.0, None)["natural_ceiling"] == 25
    # (as female, 17.0 would be "above_avg" — proves the default branch)
    assert _ffmi_category(17.0, "female")["category"] == "above_avg"
