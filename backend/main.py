import base64
import json
import os
import random
import logging
from dotenv import load_dotenv
load_dotenv()

from typing import Any
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.model.clip_classifier import get_classifier
from backend.services.country_data import country_catalog, get_country
from backend.services.llm_service import get_llm_service

LOGGER = logging.getLogger(__name__)
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
EVAL_RESULTS_PATH = DATA_DIR / "eval_results.json"
QUIZ_COUNTRIES_PATH = DATA_DIR / "quiz_countries.json"
QUIZ_GEO_PATH = DATA_DIR / "quiz_geo_features.json"


class PredictionResponse(BaseModel):
    country: str
    confidence: float
    isoNum: int
    flag: str
    lat: float
    lng: float


class PredictPayload(BaseModel):
    top3: list[PredictionResponse]
    explanation: str
    canGuess: bool
    method: str = "ensemble"


class MapHighlight(BaseModel):
    lat: float = 0.0
    lng: float = 0.0
    label: str = ""
    isoNum: int | None = None


class QuizPayload(BaseModel):
    question: str
    questionType: str
    category: str
    promptCountry: str
    flag: str | None
    iso2: str | None
    options: list[str]
    answer: str
    funFact: str
    mapHighlight: MapHighlight | None





class EvalResultsPayload(BaseModel):
    top1: float
    top3: float
    samples: int
    method: str
    per_continent: dict[str, float]


# ── Feature 1: Analyzer Chat ──
class ChatMessage(BaseModel):
    role: str
    content: str


class AnalyzerChatRequest(BaseModel):
    imageBase64: str
    messages: list[ChatMessage]
    predictions: list[str] = []


class AnalyzerChatResponse(BaseModel):
    reply: str


# ── Feature 2: Quiz Explanation ──
class QuizExplainRequest(BaseModel):
    question: str
    userAnswer: str
    correctAnswer: str
    category: str = "general"


class QuizExplainResponse(BaseModel):
    explanation: str | None





app = FastAPI(
    title="GeoAI API",
    version="0.1.0",
    description="AI-powered geography explorer API with country prediction, quiz generation, and evaluation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

classifier = get_classifier()
llm_service = get_llm_service()


@app.get("/api/health")
async def healthcheck() -> dict[str, Any]:
    return {
        "status": "ok",
        "countriesLoaded": len(country_catalog()),
        "clipEnabled": classifier.using_clip_backend,
        "llmProvider": llm_service.provider_name,
    }


@app.get("/api/countries")
async def get_countries_by_region(region: str = Query(default="world")) -> list[dict[str, Any]]:
    region_map = {
        "asia": "Asia",
        "europe": "Europe",
        "africa": "Africa",
        "oceania": "Oceania",
        "north_america": "North America",
        "south_america": "South America",
    }
    target_continent = region_map.get(region.lower().strip())

    result = []
    for country in country_catalog():
        if target_continent and country.continent != target_continent:
            continue
        result.append({
            "name": country.name,
            "isoNum": country.iso_num,
            "iso2": country.iso2,
            "flag": country.flag,
            "capital": country.capital,
            "continent": country.continent,
            "lat": country.lat,
            "lng": country.lng,
            "funFact": country.fun_fact,
        })
    return result


@app.post("/api/predict", response_model=PredictPayload)
async def predict(file: UploadFile = File(...)) -> PredictPayload:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(image_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds the 10MB upload limit.")

    try:
        predictions = classifier.predict(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    llm_country = None
    llm_confidence = None
    try:
        llm_country, llm_confidence = llm_service.predict_country(image_bytes)
    except Exception as exc:  # pragma: no cover - defensive fallback
        LOGGER.warning("LLM ensemble signal failed: %s", exc)

    predictions = _blend_predictions(predictions, llm_country, llm_confidence)
    top_country = predictions[0]["country"] if predictions else "Unknown"
    explanation = llm_service.explain(image_bytes, top_country)
    return PredictPayload(
        top3=predictions,
        explanation=explanation,
        canGuess=_can_guess(predictions),
        method="ensemble",
    )


@app.get("/api/quiz/countries")
async def quiz_countries(
    continent: str | None = Query(default=None),
) -> dict[str, Any] | list[dict[str, Any]]:
    if not QUIZ_COUNTRIES_PATH.exists():
        raise HTTPException(status_code=404, detail="quiz_countries.json not found.")
    data = json.loads(QUIZ_COUNTRIES_PATH.read_text(encoding="utf-8"))
    if continent:
        key = continent.strip().title()
        # Handle multi-word continents
        continent_map = {
            "North America": "North America",
            "South America": "South America",
            "North_America": "North America",
            "South_America": "South America",
        }
        key = continent_map.get(key, key)
        if key not in data:
            # Try case-insensitive match
            for k in data:
                if k.lower() == continent.lower().replace("_", " "):
                    return data[k]
            raise HTTPException(status_code=404, detail=f"Continent '{continent}' not found.")
        return data[key]
    return data


@app.get("/api/quiz/geo-features")
async def quiz_geo_features(
    type: str = Query(default="oceans"),
) -> list[dict[str, Any]]:
    if not QUIZ_GEO_PATH.exists():
        raise HTTPException(status_code=404, detail="quiz_geo_features.json not found.")
    data = json.loads(QUIZ_GEO_PATH.read_text(encoding="utf-8"))
    type_lower = type.strip().lower()
    if type_lower == "mountains":
        items = data.get("mountains", []) + data.get("ranges", [])
    elif type_lower == "peaks":
        items = data.get("mountains", [])
    elif type_lower == "ranges":
        items = data.get("ranges", [])
    elif type_lower in data:
        items = data[type_lower]
    else:
        raise HTTPException(status_code=400, detail=f"Unknown type '{type}'. Use: oceans, seas, straits, peaks, ranges, mountains.")
    result = list(items)
    random.shuffle(result)
    return result


@app.get("/api/quiz/question", response_model=QuizPayload)
async def quiz_question(
    weak: str | None = Query(default=None),
    focus: list[str] = Query(default=[]),
    difficulty: str | None = Query(default=None),
    category: str = Query(default="general"),
    questionType: str = Query(default="multiple_choice"),
    region: str = Query(default="world"),
    exclude: str | None = Query(default=None),
) -> QuizPayload:
    # Build exclude set from comma-separated country names
    exclude_set = set()
    if exclude:
        exclude_set = {name.strip().lower() for name in exclude.split(",") if name.strip()}

    # Data-driven: seas, oceans, mountains, straits from geo_features
    geo_driven = {"seas", "oceans", "mountains", "straits"}
    if category in geo_driven and QUIZ_GEO_PATH.exists():
        geo_data = json.loads(QUIZ_GEO_PATH.read_text(encoding="utf-8"))
        if category == "mountains":
            pool = geo_data.get("mountains", []) + geo_data.get("ranges", [])
        elif category in geo_data:
            pool = geo_data[category]
        else:
            pool = []
        # Filter out already-asked items
        pool = [item for item in pool if item["name"].lower() not in exclude_set]
        if not pool:
            # All exhausted, reset pool
            if category == "mountains":
                pool = geo_data.get("mountains", []) + geo_data.get("ranges", [])
            elif category in geo_data:
                pool = geo_data[category]
            else:
                pool = []
        if pool:
            item = random.choice(pool)
            return QuizPayload(
                question=item["question"],
                questionType="multiple_choice",
                category=category,
                promptCountry=item["name"],
                flag=None,
                iso2=None,
                options=item["options"],
                answer=item["answer"],
                funFact=item.get("funFact", ""),
                mapHighlight=MapHighlight(
                    lat=item.get("lat", 0),
                    lng=item.get("lng", 0),
                    label=item["name"],
                ),
            )

    # Data-driven: capitals and flags from quiz_countries
    country_driven = {"capitals", "flags"}
    if category in country_driven and QUIZ_COUNTRIES_PATH.exists():
        all_data = json.loads(QUIZ_COUNTRIES_PATH.read_text(encoding="utf-8"))
        # Resolve region to continent key
        region_map = {
            "asia": "Asia", "europe": "Europe", "africa": "Africa",
            "oceania": "Oceania", "north_america": "North America",
            "south_america": "South America",
        }
        continent_key = region_map.get(region.lower().replace(" ", "_"))
        if continent_key and continent_key in all_data:
            pool = list(all_data[continent_key])
        else:
            pool = [c for countries in all_data.values() for c in countries]

        # Filter out already-asked countries
        pool = [c for c in pool if c["name"].lower() not in exclude_set]
        if not pool:
            # All exhausted, reset
            if continent_key and continent_key in all_data:
                pool = list(all_data[continent_key])
            else:
                pool = [c for countries in all_data.values() for c in countries]

        if len(pool) >= 4:
            answer_country = random.choice(pool)
            # Pick 3 wrong options from same continent if possible
            same_pool = [c for c in pool if c["name"] != answer_country["name"]]
            if len(same_pool) < 3:
                # Supplement from other continents
                all_flat = [c for countries in all_data.values() for c in countries if c["name"] != answer_country["name"]]
                same_pool = all_flat
            wrong = random.sample(same_pool, min(3, len(same_pool)))
            options_countries = [answer_country] + wrong
            random.shuffle(options_countries)

            if category == "capitals":
                return QuizPayload(
                    question=f"What is the capital of {answer_country['name']}?",
                    questionType="multiple_choice",
                    category=category,
                    promptCountry=answer_country["name"],
                    flag=None,
                    iso2=answer_country.get("iso2"),
                    options=[c["capital"] for c in options_countries],
                    answer=answer_country["capital"],
                    funFact=answer_country.get("funFact", ""),
                    mapHighlight=MapHighlight(
                        lat=answer_country.get("capitalLat", answer_country.get("countryLat", 0)),
                        lng=answer_country.get("capitalLng", answer_country.get("countryLng", 0)),
                        label=answer_country["name"],
                        isoNum=int(answer_country.get("isoNum", 0)),
                    ),
                )
            else:  # flags
                return QuizPayload(
                    question=f"Which country does this flag belong to?",
                    questionType="multiple_choice",
                    category=category,
                    promptCountry=answer_country["name"],
                    flag=None,
                    iso2=answer_country.get("iso2"),
                    options=[c["name"] for c in options_countries],
                    answer=answer_country["name"],
                    funFact=answer_country.get("funFact", ""),
                    mapHighlight=MapHighlight(
                        lat=answer_country.get("countryLat", 0),
                        lng=answer_country.get("countryLng", 0),
                        label=answer_country["name"],
                        isoNum=int(answer_country.get("isoNum", 0)),
                    ),
                )

    # Fallback: LLM-backed (general or other)
    question = llm_service.generate_quiz_question(
        focus_countries=_merge_country_focus(weak, focus),
        difficulty=difficulty,
        category=category,
        question_type=questionType,
        region=region,
    )
    return QuizPayload(**question)


@app.get("/api/eval/results")
async def eval_results() -> dict[str, Any]:
    if not EVAL_RESULTS_PATH.exists():
        raise HTTPException(status_code=404, detail="Evaluation results not found. Run python -m backend.model.evaluate first.")

    return json.loads(EVAL_RESULTS_PATH.read_text(encoding="utf-8"))





def _can_guess(predictions: list[dict[str, Any]]) -> bool:
    if not predictions:
        return False
    if len(predictions) == 1:
        return predictions[0]["confidence"] >= 34

    top_confidence = predictions[0]["confidence"]
    second_confidence = predictions[1]["confidence"]
    return top_confidence >= 34 or (top_confidence - second_confidence) >= 5


def _merge_country_focus(weak: str | None, focus: list[str]) -> list[str]:
    merged = [item.strip() for item in (weak or "").split(",") if item.strip()]
    merged.extend(item for item in focus if item.strip())
    return list(dict.fromkeys(merged))


def _blend_predictions(
    clip_top3: list[dict[str, Any]],
    llm_country: str | None,
    llm_confidence: str | None,
) -> list[dict[str, Any]]:
    if not clip_top3:
        return []

    for prediction in clip_top3:
        if prediction["confidence"] > 1.0:
            prediction["confidence"] = prediction["confidence"] / 100.0

    blended_scores = {prediction["country"]: float(prediction["confidence"]) for prediction in clip_top3}
    prediction_by_country = {prediction["country"]: dict(prediction) for prediction in clip_top3}

    if llm_country:
        if llm_confidence == "high":
            if llm_country in blended_scores:
                blended_scores[llm_country] += 8.0
        elif llm_confidence == "medium":
            if llm_country in blended_scores:
                blended_scores[llm_country] += 3.0

    total_score = sum(blended_scores.values())
    if total_score <= 0:
        total_score = 1.0

    for country in blended_scores:
        blended_scores[country] = round((blended_scores[country] / total_score) * 100, 1)

    final_predictions = []
    for country, score in blended_scores.items():
        prediction = dict(prediction_by_country.get(country) or _build_prediction_from_country(country) or {})
        if not prediction:
            continue
        prediction["confidence"] = score
        final_predictions.append(prediction)

    final_predictions.sort(key=lambda prediction: prediction.get("confidence", 0), reverse=True)
    return final_predictions[:3]


def _build_prediction_from_country(country_name: str) -> dict[str, Any] | None:
    try:
        country = get_country(country_name)
    except KeyError:
        LOGGER.warning("Could not resolve metadata for ensemble country %s", country_name)
        return None

    return {
        "country": country.name,
        "confidence": 0.0,
        "isoNum": country.iso_num,
        "flag": country.flag,
        "lat": country.lat,
        "lng": country.lng,
    }


# ═══════════════════════════════════════════════════════
# Feature 1: Conversational Hint System
# ═══════════════════════════════════════════════════════

@app.post("/api/analyzer/chat", response_model=AnalyzerChatResponse)
async def analyzer_chat(request: AnalyzerChatRequest) -> AnalyzerChatResponse:
    if not request.imageBase64:
        raise HTTPException(status_code=400, detail="imageBase64 is required.")
    if not request.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    try:
        image_bytes = base64.b64decode(request.imageBase64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    reply = llm_service.chat_about_image(
        image_bytes, messages, predictions=request.predictions
    )
    return AnalyzerChatResponse(reply=reply)


# ═══════════════════════════════════════════════════════
# Feature 2: Adaptive Quiz Explanations
# ═══════════════════════════════════════════════════════

@app.post("/api/quiz/explain", response_model=QuizExplainResponse)
async def quiz_explain(request: QuizExplainRequest) -> QuizExplainResponse:
    explanation = llm_service.explain_wrong_answer(
        question_text=request.question,
        user_answer=request.userAnswer,
        correct_answer=request.correctAnswer,
        category=request.category,
    )
    return QuizExplainResponse(explanation=explanation)



