from math import log10, ceil
from app.schemas import TrackInput, UnitStats, SynergyBuffs

BASE_STAT = 100.0
BASE_HP = 500.0
BASE_ATTACK = 50.0
BASE_AS = 1.0

GENRE_MAP = {
    "k-pop": "K-Pop",
    "korean pop": "K-Pop",
    "k-rap": "Hip-Hop",
    "korean r&b": "Hip-Hop",
    "k-indie": "Indie",
    "korean indie rock": "Rock",
    "edm": "EDM",
    "trot": "Trot",
}


def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def _get_synergy_tag(genres: list[str]) -> str | None:
    for genre in genres:
        tag = GENRE_MAP.get(genre.lower())
        if tag:
            return tag
    return None


def compute_unit_stats(track: TrackInput) -> UnitStats:
    # Power (민주화 알고리즘: 선택률 높을수록 페널티)
    power = BASE_STAT * (log10(max(track.followers, 1)) / log10(max(track.total_streams, 10)))
    power *= (1 - clamp(track.selection_rate_percent, 0, 95) / 100)

    # HP / Attack Speed
    duration_sec = max(track.duration_ms / 1000, 30)
    hp = BASE_HP * clamp(duration_sec / 180, 0.5, 1.5)
    attack_speed = BASE_AS * clamp(180 / duration_sec, 0.6, 2.0)

    # Cost (1~5)
    cost = max(1, min(5, ceil(track.popularity / 20)))

    # Explicit 디버프
    proc_chance = (10 + 5 * track.star_level) if track.explicit else 0

    # Attack
    attack = BASE_ATTACK * (power / BASE_STAT)

    # 장르 시너지
    tag = _get_synergy_tag(track.genres)
    buffs = SynergyBuffs()
    if tag == "K-Pop":
        attack_speed *= 1.05
        buffs = SynergyBuffs(attack_speed_bonus="+5%")
    elif tag == "Hip-Hop":
        attack *= 1.05
        buffs = SynergyBuffs(attack_bonus="+5%")
    elif tag == "Indie":
        buffs = SynergyBuffs(lifesteal_meta="+5%")
    elif tag == "Rock":
        hp *= 1.08
        buffs = SynergyBuffs(hp_bonus="+8%")
    elif tag == "EDM":
        buffs = SynergyBuffs(stun_chance_meta="+3%")
    elif tag == "Trot":
        buffs = SynergyBuffs(gold_if_win_meta="+1")

    return UnitStats(
        unit_id=track.track_id,
        track_name=track.track_name,
        artist_name=track.artist_name,
        cost=cost,
        power=round(power, 2),
        hp=round(hp, 2),
        attack=round(attack, 2),
        attack_speed=round(attack_speed, 3),
        explicit_proc_chance=proc_chance,
        synergy_tag=tag,
        synergy_buffs=buffs,
        star_level=track.star_level,
    )
