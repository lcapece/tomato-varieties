#!/usr/bin/env python3
"""
Resolve tomato variety images from Wikimedia Commons.

The resolver is intentionally conservative. It stores both matches and misses so
future runs can resume without hammering Commons, and it only accepts image
results that look tomato-related or strongly variety-name-related.
"""

from __future__ import annotations

import argparse
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
USER_AGENT = "TomatoAtlasToy/0.1 (local research image resolver; Wikimedia Commons API)"
TOMATO_TERMS = ("tomato", "tomatoes", "solanum lycopersicum", "lycopersicon")


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def tokenise_name(name: str) -> list[str]:
    stop = {"the", "and", "of", "a", "an", "tomato", "hybrid"}
    return [
        token
        for token in re.findall(r"[a-z0-9]+", name.lower())
        if len(token) > 2 and token not in stop
    ]


def load_dataset() -> list[dict[str, Any]]:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("varieties", [])


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {
            "generated_at": None,
            "source": "Wikimedia Commons API",
            "items": {},
            "stats": {"matched": 0, "no_match": 0},
        }
    with CACHE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_cache(cache: dict[str, Any]) -> None:
    items = cache.get("items", {})
    cache["generated_at"] = datetime.now(timezone.utc).isoformat()
    cache["stats"] = {
        "matched": sum(1 for item in items.values() if item.get("status") == "matched"),
        "no_match": sum(1 for item in items.values() if item.get("status") == "no_match"),
    }
    tmp_path = CACHE_PATH.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(cache, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")
    tmp_path.replace(CACHE_PATH)


def commons_search(query: str, session: requests.Session, request_sleep: float) -> list[dict[str, Any]]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "gsrlimit": "6",
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": "900",
    }
    response = session.get(COMMONS_API, params=params, timeout=20)
    if response.status_code == 429:
        retry_after = float(response.headers.get("Retry-After", "4"))
        time.sleep(max(retry_after, 4))
        response = session.get(COMMONS_API, params=params, timeout=20)
    response.raise_for_status()
    time.sleep(request_sleep)
    pages = response.json().get("query", {}).get("pages", {})
    return list(pages.values())


def metadata_text(page: dict[str, Any]) -> str:
    imageinfo = (page.get("imageinfo") or [{}])[0]
    metadata = imageinfo.get("extmetadata") or {}
    values = [page.get("title", "")]
    for key in ("ObjectName", "ImageDescription", "Categories", "Credit", "Artist"):
        value = metadata.get(key, {}).get("value")
        if value:
            values.append(re.sub(r"<[^>]+>", " ", value))
    return compact(" ".join(values)).lower()


def score_candidate(name: str, page: dict[str, Any]) -> int:
    imageinfo = (page.get("imageinfo") or [{}])[0]
    if not str(imageinfo.get("mime", "")).startswith("image/"):
        return -999

    text = metadata_text(page)
    tokens = tokenise_name(name)
    score = 0

    if any(term in text for term in TOMATO_TERMS):
        score += 35

    token_hits = sum(1 for token in tokens if token in text)
    score += token_hits * 16

    title = page.get("title", "").lower()
    if tokens and all(token in title for token in tokens[: min(2, len(tokens))]):
        score += 20

    if any(bad in text for bad in ("tomato frog", "tomato clownfish", "tomato soup can", "tomato fight")):
        score -= 45

    if len(tokens) == 1 and token_hits == 1 and not any(term in text for term in TOMATO_TERMS):
        score -= 24

    return score


def acceptable_candidate(name: str, page: dict[str, Any]) -> bool:
    text = metadata_text(page)
    title = page.get("title", "").lower()
    tokens = tokenise_name(name)
    if not any(term in text for term in TOMATO_TERMS):
        return False
    if not tokens:
        return False

    title_hits = sum(1 for token in tokens if token in title)
    text_hits = sum(1 for token in tokens if token in text)

    if len(tokens) == 1:
        return title_hits == 1 and ("tomato" in title or "tomatoes" in title)

    if len(tokens) == 2:
        return title_hits == 2 or (title_hits >= 1 and text_hits == 2)

    return title_hits >= 2 or text_hits >= min(3, len(tokens))


def image_record(name: str, query: str, page: dict[str, Any], score: int) -> dict[str, Any]:
    imageinfo = (page.get("imageinfo") or [{}])[0]
    metadata = imageinfo.get("extmetadata") or {}
    return {
        "status": "matched",
        "name": name,
        "query": query,
        "score": score,
        "title": page.get("title", ""),
        "url": imageinfo.get("url", ""),
        "thumb_url": imageinfo.get("thumburl") or imageinfo.get("url", ""),
        "description_url": imageinfo.get("descriptionurl", ""),
        "mime": imageinfo.get("mime", ""),
        "license": metadata.get("LicenseShortName", {}).get("value", ""),
        "artist": compact(re.sub(r"<[^>]+>", " ", metadata.get("Artist", {}).get("value", ""))),
        "credit": compact(re.sub(r"<[^>]+>", " ", metadata.get("Credit", {}).get("value", ""))),
    }


def resolve_one(name: str, session: requests.Session, request_sleep: float, max_queries: int) -> dict[str, Any]:
    queries = [
        f'"{name}" tomato',
        f'{name} tomato',
        f'"{name}" "Solanum lycopersicum"',
    ]
    best: tuple[int, str, dict[str, Any]] | None = None

    for query in queries[:max_queries]:
        pages = commons_search(query, session, request_sleep)
        for page in pages:
            if not acceptable_candidate(name, page):
                continue
            score = score_candidate(name, page)
            if best is None or score > best[0]:
                best = (score, query, page)
        if best and best[0] >= 46:
            break

    if best and best[0] >= 34:
        return image_record(name, best[1], best[2], best[0])

    return {
        "status": "no_match",
        "name": name,
        "queries": queries[:max_queries],
        "best_score": best[0] if best else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve tomato variety images from Wikimedia Commons.")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of unresolved varieties to process.")
    parser.add_argument("--name", help="Resolve one specific variety name.")
    parser.add_argument("--sleep", type=float, default=0.55, help="Seconds to sleep between Commons API calls.")
    parser.add_argument("--max-queries", type=int, default=1, help="Maximum search queries per variety.")
    parser.add_argument("--refresh", action="store_true", help="Re-query names already in the cache.")
    args = parser.parse_args()

    varieties = load_dataset()
    if args.name:
        requested = compact(args.name).lower()
        varieties = [variety for variety in varieties if compact(variety.get("name", "")).lower() == requested]
        if not varieties:
            raise SystemExit(f"No variety named {args.name!r} found in {DATA_PATH}")
    cache = load_cache()
    items = cache.setdefault("items", {})
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    processed = 0
    for index, variety in enumerate(varieties, start=1):
        name = compact(variety.get("name", ""))
        if not name:
            continue
        if not args.refresh and name in items and items[name].get("status") != "error":
            continue
        if args.limit and processed >= args.limit:
            break

        try:
            items[name] = resolve_one(name, session, args.sleep, max(1, args.max_queries))
            processed += 1
            status = items[name].get("status")
            title = items[name].get("title", "")
            print(f"[{index}/{len(varieties)}] {name}: {status} {title}")
        except Exception as error:  # keep the run resumable
            items[name] = {"status": "error", "name": name, "error": str(error)}
            processed += 1
            print(f"[{index}/{len(varieties)}] {name}: error {error}")

        save_cache(cache)

    save_cache(cache)
    print(json.dumps(cache["stats"], indent=2))


if __name__ == "__main__":
    main()
