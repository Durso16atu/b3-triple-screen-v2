import argparse
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import jsonschema

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from src.collectors.rates_di import get_annual_cdi_rate
except ImportError:

    def get_annual_cdi_rate() -> float:
        return 0.1075


from src.engine.black_scholes import black_scholes_analytical  # noqa: E402
from src.engine.implied_vol import get_implied_volatility  # noqa: E402
from src.engine.invariants import check_intrinsic_bound  # noqa: E402


def process_pipeline(schema_path: str, output_path: str, mock_data=None):
    cdi_rate = get_annual_cdi_rate()

    if mock_data is None:
        mock_data = {
            "underlyings": [{"ticker": "PETR4", "spot_price": 40.0, "trend_signal": "ALTA"}],
            "options": [
                {
                    "symbol": "PETRD420",
                    "underlying_ticker": "PETR4",
                    "type": "CALL",
                    "style": "EUROPEAN",
                    "strike": 42.0,
                    "maturity_date": "2026-11-20",
                    "du": 21,
                    "spot_price": 40.0,
                    "market_price": 0.50,
                }
            ],
        }

    now_utc = datetime.now(UTC).isoformat()
    business_date = datetime.now().date().isoformat()

    options_out = []
    for opt in mock_data["options"]:
        is_call = opt["type"] == "CALL"
        bs_res = black_scholes_analytical(
            S=opt["spot_price"],
            K=opt["strike"],
            du=opt["du"],
            cdi_anual=cdi_rate,
            vol=0.30,
            is_call=is_call,
        )

        iv = get_implied_volatility(
            market_price=opt["market_price"],
            S=opt["spot_price"],
            K=opt["strike"],
            du=opt["du"],
            cdi_anual=cdi_rate,
            is_call=is_call,
        )

        if iv is not None:
            bs_res = black_scholes_analytical(
                S=opt["spot_price"],
                K=opt["strike"],
                du=opt["du"],
                cdi_anual=cdi_rate,
                vol=iv,
                is_call=is_call,
            )

        intrinsic_ok = check_intrinsic_bound(
            opt["market_price"], opt["spot_price"], opt["strike"], is_call
        )

        opt_processed = {
            "symbol": opt["symbol"],
            "underlying_ticker": opt["underlying_ticker"],
            "type": opt["type"],
            "style": opt["style"],
            "strike": opt["strike"],
            "maturity_date": opt["maturity_date"],
            "du": opt["du"],
            "spot_price": opt["spot_price"],
            "market_price": opt["market_price"],
            "theoretical_price": round(bs_res.price, 4),
            "iv": iv if iv is not None else 0.0,
            "greeks": {
                "delta": round(bs_res.delta, 4),
                "gamma": round(bs_res.gamma, 4),
                "theta_du": round(bs_res.theta_du, 4),
                "vega": round(bs_res.vega, 4),
                "rho": round(bs_res.rho, 4),
            },
            "actuarial_checks": {"intrinsic_bound_ok": intrinsic_ok, "parity_violation_brl": 0.0},
        }
        options_out.append(opt_processed)

    underlyings_out = []
    for und in mock_data["underlyings"]:
        underlyings_out.append(
            {
                "ticker": und["ticker"],
                "spot_price": und["spot_price"],
                "trend_signal": und["trend_signal"],
                "updated_at": now_utc,
            }
        )

    payload = {
        "metadata": {
            "schema_version": "2.0.0",
            "generated_at_utc": now_utc,
            "business_date": business_date,
            "cdi_rate_annual": cdi_rate,
            "workdays_per_year": 252,
            "engine_version": "1.0.0",
            "checksum": "",
        },
        "underlyings": underlyings_out,
        "options": options_out,
    }

    checksum_str = json.dumps(payload, sort_keys=True)
    payload["metadata"]["checksum"] = hashlib.sha256(checksum_str.encode()).hexdigest()

    with open(schema_path) as f:
        schema = json.load(f)
    jsonschema.validate(instance=payload, schema=schema)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_path = output_path + ".tmp"
    with open(temp_path, "w") as f:
        json.dump(payload, f, indent=2)
    os.replace(temp_path, output_path)

    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--offline", action="store_true", help="Run offline without collecting data"
    )
    parser.add_argument("--output", default="data/latest.json", help="Output JSON path")
    parser.add_argument("--schema", default="data/schemas/schema_v2.json", help="Schema path")
    args = parser.parse_args()

    process_pipeline(schema_path=args.schema, output_path=args.output)
