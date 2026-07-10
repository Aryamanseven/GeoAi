from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app


client = TestClient(app)


def _sample_image_bytes() -> bytes:
    image = Image.new("RGB", (64, 64), color=(120, 150, 210))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_predict_returns_top_three_predictions() -> None:
    response = client.post(
        "/api/predict",
        files={"file": ("sample.png", _sample_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "top3" in payload
    assert "canGuess" in payload
    assert len(payload["top3"]) == 3
    for prediction in payload["top3"]:
        assert {"country", "confidence", "isoNum"} <= prediction.keys()


def test_quiz_question_has_four_options() -> None:
    response = client.get("/api/quiz/question")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["options"], list)
    assert len(payload["options"]) == 4
    assert payload["answer"] in payload["options"]


def test_predict_rejects_files_over_10mb() -> None:
    oversized = b"0" * ((10 * 1024 * 1024) + 1)
    response = client.post(
        "/api/predict",
        files={"file": ("sample.png", oversized, "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Image exceeds the 10MB upload limit."
