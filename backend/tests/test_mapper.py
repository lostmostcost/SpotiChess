import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.schemas import TrackInput
from app.services.mapper import compute_unit_stats, clamp


def test_clamp():
    assert clamp(5, 0, 10) == 5
    assert clamp(-1, 0, 10) == 0
    assert clamp(11, 0, 10) == 10


def test_compute_unit_basic():
    track = TrackInput(
        track_id="test_001", track_name="Test Song", artist_name="Test Artist",
        duration_ms=180000, popularity=80, explicit=False, genres=["k-pop"],
        followers=1000000, total_streams=50000000,
        selection_rate_percent=10.0, star_level=1,
    )
    unit = compute_unit_stats(track)
    assert unit.cost == 4
    assert unit.power > 0
    assert unit.hp > 0
    assert unit.attack_speed > 0
    assert unit.synergy_tag == "K-Pop"
    assert unit.explicit_proc_chance == 0


def test_explicit_proc_chance():
    track = TrackInput(
        track_id="test_002", track_name="Explicit Song", artist_name="Test Artist",
        duration_ms=200000, popularity=60, explicit=True, genres=[],
        followers=500000, total_streams=20000000,
        selection_rate_percent=0.0, star_level=2,
    )
    unit = compute_unit_stats(track)
    assert unit.explicit_proc_chance == 20  # 10 + 5*2


def test_zero_duration_guard():
    track = TrackInput(
        track_id="test_003", track_name="Short Song", artist_name="Test Artist",
        duration_ms=0, popularity=50, explicit=False, genres=[],
        followers=100000, total_streams=5000000,
        selection_rate_percent=0.0, star_level=1,
    )
    unit = compute_unit_stats(track)
    assert unit.hp > 0
    assert unit.attack_speed > 0


def test_selection_rate_penalty():
    base = TrackInput(
        track_id="test_004", track_name="Song", artist_name="Artist",
        duration_ms=180000, popularity=70, explicit=False, genres=[],
        followers=1000000, total_streams=50000000, selection_rate_percent=0.0,
    )
    popular = TrackInput(
        track_id="test_005", track_name="Song", artist_name="Artist",
        duration_ms=180000, popularity=70, explicit=False, genres=[],
        followers=1000000, total_streams=50000000, selection_rate_percent=60.0,
    )
    assert compute_unit_stats(base).power > compute_unit_stats(popular).power
