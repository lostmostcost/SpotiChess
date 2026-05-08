from pydantic import BaseModel, Field
from typing import Optional


class TrackInput(BaseModel):
    track_id: str
    track_name: str
    artist_name: str
    duration_ms: int = Field(ge=0)
    popularity: int = Field(ge=0, le=100)
    explicit: bool = False
    genres: list[str] = []
    followers: int = Field(ge=0)
    total_streams: int = Field(ge=0)
    selection_rate_percent: float = Field(default=0.0, ge=0, le=100)
    star_level: int = Field(default=1, ge=1, le=3)


class SynergyBuffs(BaseModel):
    attack_speed_bonus: Optional[str] = None
    attack_bonus: Optional[str] = None
    hp_bonus: Optional[str] = None
    lifesteal_meta: Optional[str] = None
    stun_chance_meta: Optional[str] = None
    gold_if_win_meta: Optional[str] = None


class UnitStats(BaseModel):
    unit_id: str
    track_name: str
    artist_name: str
    cost: int
    power: float
    hp: float
    attack: float
    attack_speed: float
    explicit_proc_chance: int
    synergy_tag: Optional[str] = None
    synergy_buffs: SynergyBuffs = SynergyBuffs()
    star_level: int


class BattleRequest(BaseModel):
    team_a: list[UnitStats]
    team_b: list[UnitStats]


class BattleResult(BaseModel):
    winner: str
    team_a_power: float
    team_b_power: float
    score_gap: float
    logs: list[str]
