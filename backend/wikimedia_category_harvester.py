#!/usr/bin/env python3
"""
Harvest Wikimedia Commons images from tomato cultivar categories.

This is safer than free-text search: Commons categories such as
Category:Green Zebra (tomato) already identify the cultivar, so file matches
from those categories are high-confidence and cheap to cache.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "tomato_varieties.json"
CACHE_PATH = ROOT / "wikimedia_images.json"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
SOURCE_CATEGORY = "Category:Tomato cultivars by name"
USER_AGENT = "TomatoAtlasToy/0.1 (local Wikimedia category harvester)"


def norm(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\([^)]*\)", " ", value)
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def load_dataset() -> list[dict[str, Any]]:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle).get("varieties", [])


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {"generated_at": None, "source": "Wikimedia Commons API", "items": {}, "stats": {}}
    with CACHE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_cache(cache: dict[str, Any]) -> None:
    items = cache.setdefault("items", {})
    cache["generated_at"] = datetime.now(timezone.utc).isoformat()
    cache["stats"] = {
        "matched": sum(1 for item in items.values() if item.get("status") == "matched"),
        "no_match": sum(1 for item in items.values() if item.get("status") == "no_match"),
    }
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(cache, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
    tmp.replace(CACHE_PATH)


def commons_query(session: requests.Session, params: dict[str, str]) -> dict[str, Any]:
    response = session.get(COMMONS_API, params=params, timeout=25)
    if response.status_code == 429:
        time.sleep(max(float(response.headers.get("Retry-After", "4")), 4))
        response = session.get(COMMONS_API, params=params, timeout=25)
    response.raise_for_status()
    time.sleep(0.35)
    return response.json()


def category_members(session: requests.Session, category: str, cmtype: str, limit: str = "500") -> list[dict[str, Any]]:
    members: list[dict[str, Any]] = []
    cont: dict[str, str] = {}
    while True:
        params = {
            "action": "query",
            "format": "json",
            "list": "categorymembers",
            "cmtitle": category,
            "cmlimit": limit,
            "cmtype": cmtype,
        }
        params.update(cont)
        data = commons_query(session, params)
        members.extend(data.get("query", {}).get("categorymembers", []))
        if "continue" not in data:
            break
        cont = data["continue"]
    return members


def category_to_name(title: str) -> str:
    name = title.replace("Category:", "")
    solanum = re.search(r"Solanum lycopersicum ['\"]([^'\"]+)['\"]", name)
    if solanum:
        return compact(solanum.group(1))
    name = re.sub(r"\s+\(tomato\)$", "", name, flags=re.I)
    return compact(name)


def imageinfo_for_file(session: requests.Session, title: str) -> dict[str, Any] | None:
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": "900",
    }
    pages = commons_query(session, params).get("query", {}).get("pages", {})
    page = next(iter(pages.values()), None)
    if not page:
        return None
    info = (page.get("imageinfo") or [{}])[0]
    if not str(info.get("mime", "")).startswith("image/"):
        return None
    metadata = info.get("extmetadata") or {}
    return {
        "title": page.get("title", title),
        "url": info.get("url", ""),
        "thumb_url": info.get("thumburl") or info.get("url", ""),
        "description_url": info.get("descriptionurl", ""),
        "mime": info.get("mime", ""),
        "license": metadata.get("LicenseShortName", {}).get("value", ""),
        "artist": compact(re.sub(r"<[^>]+>", " ", metadata.get("Artist", {}).get("value", ""))),
        "credit": compact(re.sub(r"<[^>]+>", " ", metadata.get("Credit", {}).get("value", ""))),
    }


def choose_file(files: list[dict[str, Any]], dataset_name: str) -> dict[str, Any] | None:
    if not files:
        return None
    bad_terms = ("seedling", "rhizotron", "logo", "map", "illustration", "seed catalogue", "seed catalog")
    name_tokens = [token for token in norm(dataset_name).split() if len(token) > 2]
    scored = []
    for file in files:
        title = file.get("title", "")
        lowered = title.lower()
        score = 0
        if "tomato" in lowered or "tomate" in lowered or "pomodoro" in lowered:
            score += 20
        score += sum(1 for token in name_tokens if token in norm(title).split()) * 14
        if any(term in lowered for term in bad_terms):
            score -= 18
        scored.append((score, title, file))
    best = sorted(scored, reverse=True)[0]
    if best[0] < 4:
        return None
    return best[2]


def main() -> None:
    varieties = load_dataset()
    by_norm = {norm(variety["name"]): variety["name"] for variety in varieties if variety.get("name")}
    cache = load_cache()
    items = cache.setdefault("items", {})
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    subcats = category_members(session, SOURCE_CATEGORY, "subcat")
    matched_categories = []
    for subcat in subcats:
        category_name = category_to_name(subcat.get("title", ""))
        dataset_name = by_norm.get(norm(category_name))
        if dataset_name:
            matched_categories.append((dataset_name, subcat.get("title", "")))

    print(f"Matched {len(matched_categories)} Commons categories to dataset names.")

    harvested = 0
    for dataset_name, category_title in matched_categories:
        if items.get(dataset_name, {}).get("status") == "matched":
            continue
        files = category_members(session, category_title, "file", "20")
        chosen = choose_file(files, dataset_name)
        if not chosen:
            continue
        info = imageinfo_for_file(session, chosen["title"])
        if not info:
            continue
        items[dataset_name] = {
            "status": "matched",
            "name": dataset_name,
            "query": category_title,
            "score": 90,
            **info,
        }
        harvested += 1
        print(f"{dataset_name}: {info['title']}")
        save_cache(cache)

    save_cache(cache)
    print(f"Harvested {harvested} new images.")
    print(json.dumps(cache["stats"], indent=2))


if __name__ == "__main__":
    main()
