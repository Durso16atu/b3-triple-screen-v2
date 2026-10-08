import json
import os

from src.pipeline import process_pipeline


def test_process_pipeline_schema_validation():
    out_path = "data/latest.json"
    if os.path.exists(out_path):
        os.remove(out_path)

    payload = process_pipeline()

    assert os.path.exists(out_path)
    with open(out_path) as f:
        data = json.load(f)

    assert data["metadata"]["schema_version"] == "2.0.0"
    assert data["metadata"]["checksum"] == payload["metadata"]["checksum"]
    assert len(data["options"]) == 1

    os.remove(out_path)
