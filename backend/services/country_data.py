from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "country_metadata.json"


@dataclass(frozen=True)
class CountryRecord:
    name: str
    iso_num: int
    iso_alpha3: str
    iso2: str
    flag: str
    capital: str
    continent: str
    lat: float
    lng: float
    fun_fact: str


@lru_cache(maxsize=1)
def country_catalog() -> list[CountryRecord]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [
        CountryRecord(
            name=item["name"],
            iso_num=item["isoNum"],
            iso_alpha3=item["isoAlpha3"],
            iso2=item.get("iso2", "").lower(),
            flag=item["flag"],
            capital=item["capital"],
            continent=item["continent"],
            lat=item["lat"],
            lng=item["lng"],
            fun_fact=item["funFact"],
        )
        for item in raw
    ]


@lru_cache(maxsize=1)
def country_lookup() -> dict[str, CountryRecord]:
    return {country.name: country for country in country_catalog()}


def get_country(name: str) -> CountryRecord:
    try:
        return country_lookup()[name]
    except KeyError as exc:
        raise KeyError(f"Country metadata missing for {name}") from exc

