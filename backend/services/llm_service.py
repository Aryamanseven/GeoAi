from __future__ import annotations

import base64
import json
import os
from typing import Any
import random

from dotenv import load_dotenv

from backend.services.country_data import country_catalog


load_dotenv()

try:
    from groq import Groq
except ImportError:  # pragma: no cover - optional dependency
    Groq = None


class LLMService:
    def __init__(self) -> None:
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.provider_name = self._resolve_provider_name()
        self.client = self._build_client()

    def predict_country(self, image_bytes: bytes) -> tuple[str | None, str | None]:
        if not self.client:
            return None, None

        try:
            return self._groq_country_prediction(image_bytes)
        except Exception:
            return None, None

    def explain(self, image_bytes: bytes, top_country: str) -> str:
        if not self.client:
            return self._fallback_explanation(top_country)

        try:
            return self._groq_explanation(image_bytes, top_country)
        except Exception:
            return self._fallback_explanation(top_country)

    def generate_quiz_question(
        self,
        focus_countries: list[str] | None = None,
        difficulty: str | None = None,
        category: str = "general",
        question_type: str = "multiple_choice",
        region: str = "world",
    ) -> dict[str, Any]:
        if not self.client:
            return self._fallback_quiz_question(category, region)

        try:
            return self._groq_quiz_question(focus_countries, difficulty, category, question_type, region)
        except Exception as e:
            print(f"Groq API Error: {e}")
            return self._fallback_quiz_question(category, region)

    def _resolve_provider_name(self) -> str:
        if self.groq_api_key and Groq is not None:
            return "groq"
        return "local-fallback"

    def _build_client(self) -> Groq | None:
        if not self.groq_api_key or Groq is None:
            return None

        try:
            return Groq(api_key=self.groq_api_key, max_retries=0)
        except Exception:
            return None

    def _groq_explanation(self, image_bytes: bytes, top_country: str) -> str:
        assert self.client is not None
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        response = self.client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a geography expert. Analyze travel and street-view style images carefully. "
                        "Explain only visible geographic clues such as scripts, architecture, road markings, "
                        "vegetation, vehicles, clothing, and infrastructure. If evidence is weak, say so clearly."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"The vision model's top guess is {top_country}. "
                                "In 2-3 sentences, explain the visual geographic clues that support or weaken that guess."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                        },
                    ],
                },
            ],
            max_tokens=180,
            temperature=0.4,
        )
        return response.choices[0].message.content or self._fallback_explanation(top_country)

    def _groq_country_prediction(self, image_bytes: bytes) -> tuple[str | None, str | None]:
        assert self.client is not None
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        response = self.client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                'Look at this image carefully. Respond with ONLY valid JSON, no markdown: '
                                '{"country": "Japan", "confidence": "high"} '
                                "Name the single most likely country based on ALL visual clues you see."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=80,
        )

        raw_content = response.choices[0].message.content or ""
        raw_content = raw_content.replace("```json", "").replace("```", "").strip()
        if not raw_content:
            return None, None

        payload = json.loads(raw_content)
        country = payload.get("country")
        confidence = payload.get("confidence")
        if not isinstance(country, str) or not country.strip():
            return None, None
        if not isinstance(confidence, str) or not confidence.strip():
            return country.strip(), None

        confidence_level = confidence.strip().lower()
        if confidence_level not in {"high", "medium", "low"}:
            confidence_level = None
        return country.strip(), confidence_level

    def _groq_quiz_question(
        self,
        focus_countries: list[str] | None,
        difficulty: str | None,
        category: str = "general",
        question_type: str = "multiple_choice",
        region: str = "world",
    ) -> dict[str, Any]:
        assert self.client is not None
        system_prompt = self._category_system_prompt(category, region)
        response = self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": self._quiz_prompt(focus_countries, difficulty, category, question_type, region)},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        raw_content = response.choices[0].message.content or ""
        raw_content = raw_content.replace("```json", "").replace("```", "").strip()
        return self._normalize_quiz_payload(json.loads(raw_content), category)

    def _category_system_prompt(self, category: str, region: str = "world") -> str:
        base = (
            "Return only valid JSON for one geography quiz question. "
            "The JSON must include keys: question, questionType, promptCountry, flag, iso2, options, answer, funFact, mapHighlight. "
            "Options must be an array of exactly 4 strings and answer must match one option exactly. "
            "The flag field must ALWAYS be a single emoji character like 🇯🇵 or 🇦🇺. Never use a URL, image path, or any text other than the emoji. "
            "iso2 must ALWAYS be a lowercase 2-letter country code like 'jp' or 'au'. "
            "mapHighlight must be an object with lat (number), lng (number), and label (string). "
        )

        region_instructions = {
            "asia": " Only generate questions about countries in Asia.",
            "africa": " Only generate questions about countries in Africa.",
            "europe": " Only generate questions about countries in Europe.",
            "north_america": " Only generate questions about countries in North America (including Central America and the Caribbean).",
            "south_america": " Only generate questions about countries in South America.",
            "oceania": " Only generate questions about countries in Oceania.",
            "world": " Generate questions from any country globally.",
        }

        category_instructions = {
            "capitals": " Generate 'What is the capital of X?' style questions only. The answer MUST be a capital city. mapHighlight must point to the capital city's lat/lng, and label should be the capital name.",
            "flags": " Generate flag identification questions. Always include the iso2 field (2-letter lowercase country code) so the frontend can display the flag image.",
            "seas": " Generate questions about seas, oceans, straits, gulfs, and major bodies of water. The mapHighlight should point to the body of water's lat/lng location, and label should be its name.",
            "mountains": " Generate questions about mountain ranges, peaks, and highest points. The mapHighlight should point to the mountain's lat/lng location, and label should be its name.",
        }

        return base + region_instructions.get(region, "") + category_instructions.get(category, "")

    def _fallback_explanation(self, top_country: str) -> str:
        return (
            f"Groq reasoning is not configured right now, so this explanation is a placeholder. "
            f"The current best model guess is {top_country}, but visual clue analysis will appear here once GROQ_API_KEY is set."
        )

    def _fallback_quiz_question(self, category: str = "general", region: str = "world") -> dict[str, Any]:
        if category in ["capitals", "flags", "countries"]:
            catalog = country_catalog()
            if region != "world":
                target_continent = region.replace("_", " ").title()
                catalog = [c for c in catalog if c.continent == target_continent]
            
            # fallback if region has too few countries
            if len(catalog) < 4:
                catalog = country_catalog()

            choices = random.sample(catalog, 4)
            answer_country = choices[0]
            options = [c for c in choices]
            random.shuffle(options)
            
            if category == "capitals":
                return {
                    "question": f"What is the capital of {answer_country.name}?",
                    "questionType": "multiple_choice",
                    "category": category,
                    "promptCountry": answer_country.name,
                    "flag": answer_country.flag,
                    "iso2": answer_country.iso2,
                    "options": [c.capital for c in options],
                    "answer": answer_country.capital,
                    "funFact": answer_country.fun_fact or f"The capital of {answer_country.name} is {answer_country.capital}.",
                    "mapHighlight": {"lat": answer_country.lat, "lng": answer_country.lng, "label": answer_country.name},
                }
            
            if category == "flags":
                return {
                    "question": "Which country does this flag belong to?",
                    "questionType": "multiple_choice",
                    "category": category,
                    "promptCountry": answer_country.name,
                    "flag": answer_country.flag,
                    "iso2": answer_country.iso2,
                    "options": [c.name for c in options],
                    "answer": answer_country.name,
                    "funFact": answer_country.fun_fact or f"This is the flag of {answer_country.name}.",
                    "mapHighlight": {"lat": answer_country.lat, "lng": answer_country.lng, "label": answer_country.name},
                }
            
            if category == "countries":
                return {
                    "question": "Which country is this?",
                    "questionType": "multiple_choice",
                    "category": category,
                    "promptCountry": answer_country.name,
                    "flag": answer_country.flag,
                    "iso2": answer_country.iso2,
                    "options": [c.name for c in options],
                    "answer": answer_country.name,
                    "funFact": answer_country.fun_fact or f"This is {answer_country.name}.",
                    "mapHighlight": {"lat": answer_country.lat, "lng": answer_country.lng, "label": answer_country.name},
                }
            
        if category == "seas":
            return {
                "question": "Which ocean is the largest on Earth?",
                "questionType": "multiple_choice",
                "category": category,
                "promptCountry": "Pacific Ocean",
                "flag": "🌊",
                "iso2": "xx",
                "options": ["Atlantic", "Indian", "Arctic", "Pacific"],
                "answer": "Pacific",
                "funFact": "The Pacific Ocean covers more than 30% of the Earth's surface.",
                "mapHighlight": {"lat": 0, "lng": -160, "label": "Pacific Ocean"},
            }
            
        if category == "mountains":
            return {
                "question": "Which mountain range spans across South America?",
                "questionType": "multiple_choice",
                "category": category,
                "promptCountry": "Andes",
                "flag": "⛰",
                "iso2": "xx",
                "options": ["Rockies", "Himalayas", "Andes", "Alps"],
                "answer": "Andes",
                "funFact": "The Andes is the longest continental mountain range in the world.",
                "mapHighlight": {"lat": -32.65, "lng": -70.01, "label": "Andes"},
            }

        return {
            "question": "Which country does this flag belong to?",
            "questionType": "multiple_choice",
            "category": category,
            "promptCountry": "Japan",
            "flag": "🇯🇵",
            "iso2": "jp",
            "options": ["Japan", "South Korea", "China", "Thailand"],
            "answer": "Japan",
            "funFact": "This is a fallback sample question because Groq is not configured. Fun fact: Japan's Shinkansen is famous for speed and punctuality.",
            "mapHighlight": {"lat": 35.7, "lng": 139.7, "label": "Japan"},
        }

    def _quiz_prompt(self, focus_countries: list[str] | None, difficulty: str | None, category: str = "general", question_type: str = "multiple_choice", region: str = "world") -> str:
        focus_text = ", ".join(focus_countries or []) or "no specific focus"
        seed = random.randint(1, 100000)
        return (
            f"Create one {category} geography quiz question as JSON with keys: question, questionType, promptCountry, flag, iso2, options, answer, funFact, mapHighlight. "
            f"Focus on the {region} region. "
            f"CRITICAL: Pick a completely RANDOM and potentially obscure country or feature to ensure high variety across requests! Do not just pick the most famous one. "
            f"Use this random seed to strongly influence your choice: {seed}. "
            f"questionType should be '{question_type}'. "
            "flag must be emoji only (e.g. 🇯🇵). iso2 must be lowercase 2-letter code (e.g. 'jp'). "
            "mapHighlight must have lat, lng, and label. "
            "Keep the wording concise and student-friendly. "
            f"Bias toward these countries when helpful: {focus_text}. Difficulty: {difficulty or 'mixed'}."
        )

    def _normalize_quiz_payload(self, payload: dict[str, Any], category: str = "general") -> dict[str, Any]:
        options = payload.get("options")
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError("Groq response did not include exactly 4 options.")

        answer = payload.get("answer")
        if not isinstance(answer, str) or answer not in options:
            raise ValueError("Groq response answer is missing or not present in options.")

        question = payload.get("question", "")
        prompt_country = payload.get("promptCountry", "")
        flag = payload.get("flag")
        iso2 = payload.get("iso2")
        fun_fact = payload.get("funFact", "")
        question_type = payload.get("questionType", "multiple_choice")
        map_highlight = payload.get("mapHighlight")

        # Ensure flag is emoji only, not a URL
        if isinstance(flag, str) and flag.startswith("http"):
            flag = None

        # Ensure iso2 is lowercase
        if isinstance(iso2, str):
            iso2 = iso2.lower().strip()
            if len(iso2) != 2:
                iso2 = None

        result = {
            "question": str(question).strip(),
            "questionType": str(question_type).strip() or "multiple_choice",
            "category": category,
            "promptCountry": str(prompt_country).strip() if prompt_country else "",
            "flag": flag.strip() if isinstance(flag, str) else None,
            "iso2": iso2,
            "options": [str(option).strip() for option in options],
            "answer": answer.strip(),
            "funFact": str(fun_fact).strip() if fun_fact else "",
        }

        if isinstance(map_highlight, dict):
            result["mapHighlight"] = {
                "lat": float(map_highlight.get("lat", 0)),
                "lng": float(map_highlight.get("lng", 0)),
                "label": str(map_highlight.get("label", "")),
            }
        else:
            result["mapHighlight"] = None

        return result




    # ═══════════════════════════════════════════════════════
    # Feature 1: Conversational Hint System
    # ═══════════════════════════════════════════════════════

    def chat_about_image(
        self,
        image_bytes: bytes,
        messages: list[dict[str, str]],
        predictions: list[str] | None = None,
    ) -> str:
        """Multi-turn conversation about an uploaded image.

        ``messages`` is a list of ``{"role": "user"|"assistant", "content": "..."}``
        dicts representing the conversation so far.  The latest user
        message is always the last item.
        """
        if not self.client:
            return "Groq is not configured. Set GROQ_API_KEY to enable the interactive chat."

        encoded = base64.b64encode(image_bytes).decode("utf-8")
        prediction_context = ""
        if predictions:
            prediction_context = f" The model's current top predictions are: {', '.join(predictions)}."

        system_msg = {
            "role": "system",
            "content": (
                "You are a geography detective helping the user investigate an image to figure out "
                "which country it was taken in. Analyze ONLY visible geographic clues: scripts, "
                "architecture, road markings, vegetation, vehicles, signs, climate, clothing, and "
                "infrastructure. Be specific and concise (2-3 sentences per reply). If you're unsure, "
                "say so. Never invent clues that aren't visible."
                f"{prediction_context}"
            ),
        }

        # Build the message list: system + first user message includes the image,
        # subsequent messages are text-only.
        api_messages = [system_msg]
        for i, msg in enumerate(messages):
            if i == 0 and msg["role"] == "user":
                # First user message carries the image
                api_messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": msg["content"]},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                        },
                    ],
                })
            else:
                api_messages.append({"role": msg["role"], "content": msg["content"]})

        try:
            response = self.client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=api_messages,
                max_tokens=250,
                temperature=0.5,
            )
            return response.choices[0].message.content or "I couldn't analyze that — try a different question."
        except Exception as exc:
            return f"Chat error: {exc}"

    # ═══════════════════════════════════════════════════════
    # Feature 2: Adaptive Quiz Explanations
    # ═══════════════════════════════════════════════════════

    def explain_wrong_answer(
        self,
        question_text: str,
        user_answer: str,
        correct_answer: str,
        category: str = "general",
    ) -> str | None:
        """Generate a personalized micro-lesson for a wrong quiz answer."""
        if not self.client:
            return None

        prompt = (
            f"The user was asked: \"{question_text}\"\n"
            f"They answered: \"{user_answer}\" but the correct answer is: \"{correct_answer}\".\n"
            f"Category: {category}.\n\n"
            "In 2-3 concise sentences, explain WHY the correct answer is right and what "
            "the user likely confused. Include a memorable tip or mnemonic to help them "
            "remember next time. Be encouraging, not condescending."
        )

        try:
            response = self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a friendly geography tutor. Give targeted, concise explanations.",
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=200,
                temperature=0.6,
            )
            return response.choices[0].message.content
        except Exception:
            return None




_LLM_SERVICE: LLMService | None = None


def get_llm_service() -> LLMService:
    global _LLM_SERVICE
    if _LLM_SERVICE is None:
        _LLM_SERVICE = LLMService()
    return _LLM_SERVICE


def predict_country(image_bytes: bytes) -> tuple[str | None, str | None]:
    return get_llm_service().predict_country(image_bytes)


