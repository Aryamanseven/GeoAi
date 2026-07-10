from __future__ import annotations

import io

from PIL import Image

from backend.model.clip_classifier import GeoClipClassifier


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


