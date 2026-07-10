from __future__ import annotations

import io

from PIL import Image

from backend.model.clip_classifier import GeoClipClassifier
from backend.model.evaluate import evaluate_model


def _sample_image_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (48, 48), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_classifier_returns_deterministic_top_three() -> None:
    classifier = GeoClipClassifier()
    image_bytes = _sample_image_bytes((30, 80, 200))

    first = classifier.predict(image_bytes)
    second = classifier.predict(image_bytes)

    assert first == second
    assert len(first) == 3
    assert round(sum(item["confidence"] for item in first), 5) == 1.0


def test_evaluation_payload_contains_metrics() -> None:
    classifier = GeoClipClassifier()
    report = evaluate_model(classifier)

    assert report["evaluatedSamples"] == 20
    assert report["top3Accuracy"] >= report["top1Accuracy"]
    assert report["perContinent"]
