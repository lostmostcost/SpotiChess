from __future__ import annotations

import math
from typing import Any

from app.schemas import UnitStats

BASE_HP = 100.0
BASE_ATTACK = 20.0
BASE_ATTACK_SPEED = 1.0

GENRE_MAP = {
    "k-pop": "K-Pop",
    "korean pop": "K-Pop",
    "k-rap": "Hip-Hop",
    "korean r&b": "Hip-Hop",
    "k-indie": "Indie",
    "korean indie rock": "Rock",
    "edm": "EDM",
    "electronica": "EDM",
    "trot": "Trot",
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def resolve_synergies(genres: list[str]) -> list[str]:
    tags: list[str] = []
    lowered = [g.lower() for g in genres]
    for key, tag in GENRE_MAP.items():
        if any(key in item for item in lowered) and tag not in tags:
            tags.append(tag)
        if len(tags) == 2:
            break
    return tags or ["Neutral"]


def compute_unit_stats(
    track: dict[str, Any],
    artist: dict[str, Any],
    selection_rate_percent: float,
    star_level: int,
) -> UnitStats:
    duration_sec = max(track.get("duration_ms", 0) / 1000.0, 30.0)
    popularity = int(track.get("popularity", 0))
    followers = int(artist.get("followers", {}).get("total", 0))
    total_streams = max(popularity * 2_000_000, 10)

    hp = BASE_HP * clamp(duration_sec / 180.0, 0.5, 1.5)
    attack_speed = BASE_ATTACK_SPEED * clamp(180.0 / duration_sec, 0.6, 2.0)
    attack = BASE_ATTACK

    genres = artist.get("genres", [])
    synergies = resolve_synergies(genres)
    if "Hip-Hop" in synergies:
        attack *= 1.05
    if "Rock" in synergies:
        hp *= 1.08
    if "K-Pop" in synergies:
        attack_speed *= 1.05

    core = (hp / 8.0) + (attack * 2.0) + (attack_speed * 18.0)
    power = core * (math.log10(max(followers, 1)) / math.log10(total_streams))
    power *= 1 - clamp(selection_rate_percent, 0, 95) / 100.0

    cost = max(1, min(5, math.ceil(popularity / 20)))
    explicit_proc_chance = (10 + 5 * star_level) if track.get("explicit", False) else 0

    artist_name = "Unknown Artist"
    artists = track.get("artists", [])
    if artists:
        artist_name = artists[0].get("name", artist_name)

    return UnitStats(
        track_id=track.get("id", ""),
        name=track.get("name", "Unknown Track"),
        artist=artist_name,
        popularity=popularity,
        hp=round(hp, 1),
        attack=round(attack, 1),
        attack_speed=round(attack_speed, 2),
        power=round(power, 1),
        cost=cost,
        explicit_proc_chance=explicit_proc_chance,
        synergy_tags=synergies,
    )
