from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class TrackUnitInput(BaseModel):
    track_id: str
    selection_rate_percent: float = Field(default=0.0, ge=0.0, le=95.0)
    star_level: int = Field(default=1, ge=1, le=3)


class UnitStats(BaseModel):
    track_id: str
    name: str
    artist: str
    popularity: int
    hp: float
    attack: float
    attack_speed: float
    power: float
    cost: int
    explicit_proc_chance: float
    synergy_tags: list[str]


class RoundSimulateRequest(BaseModel):
    team_a: list[TrackUnitInput] = Field(default_factory=list)
    team_b: list[TrackUnitInput] = Field(default_factory=list)
    market: str = "KR"


class RoundSimulateResponse(BaseModel):
    winner: Literal["A", "B", "DRAW"]
    score_gap: float
    logs: list[str]
    computed_team_a: list[UnitStats]
    computed_team_b: list[UnitStats]


class RoundHistoryItem(BaseModel):
    id: int
    created_at: datetime
    winner: Literal["A", "B", "DRAW"]
    score_gap: float
    logs: list[str]
    team_a: list[dict[str, Any]]
    team_b: list[dict[str, Any]]
