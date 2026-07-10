from dotenv import load_dotenv
load_dotenv()

import hashlib
import io
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np
import pycountry
from PIL import Image, UnidentifiedImageError

from backend.services.country_data import CountryRecord, country_catalog

try:
    import joblib
except ImportError:  # pragma: no cover - optional during local bootstrapping
    joblib = None

try:
    import open_clip
    from peft import LoraConfig, get_peft_model
except ImportError:  # pragma: no cover - optional during local bootstrapping
    open_clip = None
    LoraConfig = None
    get_peft_model = None

try:
    import torch
    import torch.nn as nn
except ImportError:  # pragma: no cover - optional during local bootstrapping
    torch = None
    nn = None


LOGGER = logging.getLogger(__name__)
MODEL_DIR = Path(__file__).resolve().parent / "saved"
CLASSIFIER_PATH = MODEL_DIR / "country_classifier.joblib"
LABELS_PATH = MODEL_DIR / "country_labels.npy"
FINETUNED_PATH = MODEL_DIR / "clip_finetuned.pt"

class GeoClassifier(nn.Module):
    def __init__(self, clip_model, num_classes):
        super().__init__()
        self.clip_visual = clip_model.visual
        embed_dim = getattr(clip_model.visual, 'output_dim', 768)
        
        self.classifier = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes)
        )
    def forward(self, x):
        features = self.clip_visual(x)
        if isinstance(features, tuple):
            features = features[0]
        return self.classifier(features.float())

class GeoClipClassifier:
    """Predict countries from images with an optional CLIP + sklearn backend."""

    def __init__(self) -> None:
        self.countries = country_catalog()
        self.country_names = [country.name for country in self.countries]
        self.using_clip_backend = False
        self.model = None
        self.preprocess = None
        self.classifier_head = None
        self.class_labels: list[str] = []
        self.is_finetuned = False
        self.device = torch.device("cpu") if torch else "cpu"

        # Keep startup fast and deterministic unless the user explicitly enables CLIP.
        if os.getenv("GEOAI_ENABLE_CLIP", "0") == "1":
            self._try_load_clip_backend()

    def _try_load_clip_backend(self) -> None:
        if not open_clip or not torch:
            LOGGER.warning("CLIP dependencies are unavailable; using heuristic fallback.")
            return

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # 1. Check if clip_finetuned.pt exists
        if FINETUNED_PATH.exists() and get_peft_model is not None:
            try:
                self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                    "ViT-L-14", pretrained="openai"
                )
                lora_config = LoraConfig(
                    r=16, lora_alpha=32,
                    target_modules=["attn.in_proj", "attn.out_proj"],
                    lora_dropout=0.1, bias="none"
                )
                self.model.visual = get_peft_model(self.model.visual, lora_config)
                
                checkpoint = torch.load(FINETUNED_PATH, map_location=self.device)
                num_classes = checkpoint.get("num_classes", 211)
                
                self.classifier_head = GeoClassifier(self.model, num_classes=num_classes)
                self.classifier_head.load_state_dict(checkpoint["model_state_dict"])
                self.classifier_head.to(self.device)
                self.classifier_head.eval()
                
                self.class_labels = checkpoint["classes"]
                self.using_clip_backend = True
                self.is_finetuned = True
                
                embed_dim = getattr(self.model.visual, 'output_dim', 768)
                LOGGER.info("=== MODEL LOADED ===")
                LOGGER.info(f"Architecture: {checkpoint.get('model_arch', 'ViT-B-32')}")
                LOGGER.info(f"Embed dim: {embed_dim}")
                LOGGER.info(f"Num classes: {num_classes}")
                LOGGER.info(f"Val Top-1 at training: {checkpoint.get('val_top1', 'unknown')}%")
                LOGGER.info(f"Using LoRA finetuned model: True")
                LOGGER.info("====================")
                
                return
            except Exception as exc:
                LOGGER.warning("Failed to initialize finetuned CLIP backend: %s", exc)
        
        # 2. Fallback to old logistic regression path
        if not joblib or not CLASSIFIER_PATH.exists() or not LABELS_PATH.exists():
            LOGGER.warning("Classifier head not found at %s; using heuristic fallback.", MODEL_DIR)
            return

        try:
            self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                "ViT-B-32",
                pretrained="openai",
            )
            self.model.to(self.device)
            self.model.eval()
            self.classifier_head = joblib.load(CLASSIFIER_PATH)
            self.class_labels = np.load(LABELS_PATH, allow_pickle=True).tolist()
            self.using_clip_backend = True
            self.is_finetuned = False
            LOGGER.warning("=== FALLBACK MODEL LOADED (not finetuned) ===")
            LOGGER.warning("Set GEOAI_ENABLE_CLIP=1 and ensure clip_finetuned.pt exists")
        except Exception as exc:  # pragma: no cover - depends on local model state
            LOGGER.warning("Failed to initialize CLIP backend: %s", exc)
            self.model = None
            self.preprocess = None
            self.classifier_head = None
            self.class_labels = []
            self.using_clip_backend = False

    def predict(self, image_bytes: bytes) -> list[dict[str, Any]]:
        image = self._read_image(image_bytes)

        if self.using_clip_backend and self.model and self.preprocess and self.classifier_head:
            try:
                return self._predict_with_clip(image)
            except Exception as exc:  # pragma: no cover - defensive fallback
                LOGGER.warning("CLIP prediction failed, falling back to heuristic mode: %s", exc)

        return self._predict_heuristic(image, image_bytes)

    def _read_image(self, image_bytes: bytes) -> Image.Image:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError as exc:
            raise ValueError("Could not decode the uploaded image.") from exc
        return image

    def _predict_with_clip(self, image: Image.Image) -> list[dict[str, Any]]:
        assert torch is not None

        image_tensor = self.preprocess(image).unsqueeze(0).to(self.device)
        with torch.no_grad():
            if self.is_finetuned:
                if self.device.type == "cuda":
                    with torch.cuda.amp.autocast():
                        logits = self.classifier_head(image_tensor)
                else:
                    logits = self.classifier_head(image_tensor)
                probabilities = torch.softmax(logits, dim=1)[0].cpu().numpy()
            else:
                image_features = self.model.encode_image(image_tensor)
                image_vector = image_features.cpu().numpy()
                probabilities = self.classifier_head.predict_proba(image_vector)[0]
                
        top_indices = np.argsort(probabilities)[::-1][:3]
        top_scores = probabilities[top_indices]
        score_total = float(np.sum(top_scores))

        predictions: list[dict[str, Any]] = []
        for index, score in zip(top_indices, top_scores):
            country_name = self.class_labels[index]
            country = self._country_by_name(country_name)
            normalized_score = float(score / score_total) if score_total else 1 / 3
            predictions.append(self._serialize_prediction(country, normalized_score))

        return predictions


    def _predict_heuristic(self, image: Image.Image, image_bytes: bytes) -> list[dict[str, Any]]:
        digest = hashlib.sha256(image_bytes).digest()
        mean_channels = np.asarray(image).mean(axis=(0, 1))

        scored: list[tuple[CountryRecord, float]] = []
        for idx, country in enumerate(self.countries):
            base = digest[idx % len(digest)] / 255
            geo_bias = (
                (mean_channels[0] / 255) * ((country.lat + 90) / 180) * 0.35
                + (mean_channels[1] / 255) * ((country.lng + 180) / 360) * 0.25
                + (mean_channels[2] / 255) * ((idx % 7) / 7) * 0.15
            )
            score = 0.25 + (base * 0.45) + geo_bias
            scored.append((country, float(score)))

        scored.sort(key=lambda item: item[1], reverse=True)
        top_three = scored[:3]
        total = sum(score for _, score in top_three)

        return [
            self._serialize_prediction(country, score / total if total else 1 / 3)
            for country, score in top_three
        ]

    def _country_by_name(self, name: str) -> CountryRecord:
        if name == "XK":
            for country in self.countries:
                if country.name == "Kosovo":
                    return country

        country_code = pycountry.countries.get(alpha_2=name)
        if country_code is not None:
            for country in self.countries:
                if country.iso_alpha3 == country_code.alpha_3:
                    return country

        for country in self.countries:
            if country.name == name or country.iso_alpha3 == name:
                return country
        raise KeyError(f"Unknown country returned by classifier: {name}")

    def _serialize_prediction(self, country: CountryRecord, confidence: float) -> dict[str, Any]:
        return {
            "country": country.name,
            "confidence": round(confidence, 4),
            "isoNum": country.iso_num,
            "flag": country.flag,
            "lat": country.lat,
            "lng": country.lng,
        }


_CLASSIFIER: GeoClipClassifier | None = None


def get_classifier() -> GeoClipClassifier:
    global _CLASSIFIER
    if _CLASSIFIER is None:
        _CLASSIFIER = GeoClipClassifier()
    return _CLASSIFIER
