from pathlib import Path

from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles

from app.schemas import TrackInput, UnitStats, BattleRequest, BattleResult
from app.services.mapper import compute_unit_stats
from app.services.shop import roll_shop
from app.services.battle import simulate_battle

app = FastAPI(title="SpotiChess API", version="0.1.0")

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/units/compute", response_model=UnitStats)
def compute_unit(track: TrackInput):
    return compute_unit_stats(track)


@app.get("/shop/roll", response_model=list[UnitStats])
def shop_roll(count: int = Query(default=5, ge=1, le=10)):
    return roll_shop(count)


@app.post("/battle/simulate", response_model=BattleResult)
def battle_simulate(request: BattleRequest):
    if not request.team_a or not request.team_b:
        raise HTTPException(status_code=400, detail="양 팀 모두 최소 1개 유닛이 필요합니다")
    return simulate_battle(request.team_a, request.team_b)


# 정적 파일 mount는 모든 API 라우터 등록 후 마지막에 위치 (CLAUDE.md §3).
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
