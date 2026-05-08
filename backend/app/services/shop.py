import random
from app.sample_data import SAMPLE_TRACKS
from app.services.mapper import compute_unit_stats
from app.schemas import UnitStats


def roll_shop(count: int = 5) -> list[UnitStats]:
    selected = random.sample(SAMPLE_TRACKS, min(count, len(SAMPLE_TRACKS)))
    return [compute_unit_stats(track) for track in selected]
