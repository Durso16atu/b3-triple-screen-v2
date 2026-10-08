from unittest.mock import patch

from src.collectors.rates_di import get_annual_cdi_rate


@patch("src.collectors.rates_di.requests.get")
def test_get_annual_cdi_rate_success(mock_get):
    mock_get.return_value.json.return_value = [{"valor": "11.25"}]
    mock_get.return_value.status_code = 200

    rate = get_annual_cdi_rate()
    assert rate == 0.1125


@patch("src.collectors.rates_di.requests.get")
def test_get_annual_cdi_rate_fallback(mock_get):
    mock_get.side_effect = Exception("Timeout")

    rate = get_annual_cdi_rate(fallback_rate=0.1050)
    assert rate == 0.1050
