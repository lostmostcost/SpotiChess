"""
Spotify Chess - Backend MVP
역밸런싱 로그라이크: 유명할수록 약하고, 무명일수록 강하다.
"""
import json
import random
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ==================== 상수 ====================
MAX_ROUND = 10
START_HEARTS = 3
START_GOLD = 10

ROUND_INCOME = 5
WIN_BONUS_GOLD = 1
ROUND_EXP_GAIN = 2

SHOP_SIZE = 5
BUY_COST = 3
SELL_REFUND = 3
REROLL_COST = 1
EXP_BUY_COST = 4
EXP_BUY_AMOUNT = 4

BASE_HP = 100
BASE_ATK = 10

# 인덱스 = 현재 레벨, 값 = 다음 레벨로 가기 위해 필요한 EXP
LEVEL_THRESHOLDS = [0, 2, 8, 20, 40, 72]
MAX_LEVEL = 6

MAX_BATTLE_TURNS = 30


# ==================== 데이터 로드 ====================
DATA_PATH = Path(__file__).parent / "data.json"
PUBLIC_PATH = Path(__file__).parent.parent / "public"
ASSETS_PATH = Path(__file__).parent / "assets"
with open(DATA_PATH, encoding="utf-8") as f:
    GAME_DATA = json.load(f)

ARTISTS_BY_ID = {a["artist_id"]: a for a in GAME_DATA["artists"]}


# ==================== 유틸 함수 ====================
def calc_atk(popularity: int) -> float:
    """역밸런싱 공식: ATK = 10 * (3 - 2 * popularity / 100)"""
    return round(BASE_ATK * (3 - 2 * popularity / 100), 1)


def make_track(track_data: dict, artist_id: str, idx: int) -> dict:
    """data.json의 트랙을 게임용 트랙 객체로 변환"""
    return {
        "track_id": f"{artist_id}_{idx}_{uuid.uuid4().hex[:4]}",
        "track_name": track_data["track_name"],
        "track_name_kr": track_data.get("track_name_kr"),
        "cover_image": track_data.get("cover_image"),
        "popularity": track_data["popularity"],
        "atk": calc_atk(track_data["popularity"]),
    }


def make_unit_from_track(track: dict) -> dict:
    """상점 트랙을 보드 유닛으로 변환"""
    return {
        "unit_id": uuid.uuid4().hex[:8],
        "track_name": track["track_name"],
        "track_name_kr": track.get("track_name_kr"),
        "cover_image": track.get("cover_image"),
        "popularity": track["popularity"],
        "hp": BASE_HP,
        "max_hp": BASE_HP,
        "atk": track["atk"],
    }


def try_level_up(state: dict) -> bool:
    """누적 EXP가 임계값을 넘으면 레벨업. 차감식."""
    leveled = False
    while state["level"] < MAX_LEVEL and state["exp"] >= LEVEL_THRESHOLDS[state["level"]]:
        state["exp"] -= LEVEL_THRESHOLDS[state["level"]]
        state["level"] += 1
        leveled = True
    return leveled


def refresh_shop(state: dict) -> None:
    artist = ARTISTS_BY_ID[state["artist_id"]]
    sampled = random.sample(artist["tracks"], SHOP_SIZE)
    state["shop"] = [make_track(t, state["artist_id"], i) for i, t in enumerate(sampled)]


def display_artist_name(artist: dict) -> str:
    return artist.get("artist_name_kr") or artist["artist_name"]


def display_track_name(unit: dict) -> str:
    return unit.get("track_name_kr") or unit["track_name"]


def spawn_enemies(player_artist_id: str, round_no: int) -> list[dict]:
    """플레이어가 선택하지 않은 다른 아티스트의 곡을 적 유닛으로 생성."""
    enemy_count = min(1 + round_no // 2, 6)
    enemy_artists = [a for a in GAME_DATA["artists"] if a["artist_id"] != player_artist_id]

    if not enemy_artists:
        raise HTTPException(400, detail={"error": "NO_ENEMY_ARTISTS"})

    enemy_artist = random.choice(enemy_artists)
    sampled_tracks = random.sample(
        enemy_artist["tracks"],
        min(enemy_count, len(enemy_artist["tracks"])),
    )
    enemies = []
    for i, track_data in enumerate(sampled_tracks):
        pop = track_data["popularity"]
        hp_bonus = round_no * 15
        max_hp = BASE_HP + hp_bonus
        enemies.append({
            "unit_id": f"E{round_no}_{enemy_artist['artist_id']}_{i}",
            "artist_id": enemy_artist["artist_id"],
            "artist_name": enemy_artist["artist_name"],
            "artist_name_kr": enemy_artist.get("artist_name_kr"),
            "track_name": track_data["track_name"],
            "track_name_kr": track_data.get("track_name_kr"),
            "cover_image": track_data.get("cover_image"),
            "popularity": pop,
            "hp": max_hp,
            "max_hp": max_hp,
            "atk": calc_atk(pop),
        })
    return enemies


def heal_board(state: dict) -> None:
    for u in state["board"]:
        u["hp"] = u["max_hp"]


def simulate_battle(allies: list[dict], enemies: list[dict]) -> tuple[bool, list[str]]:
    """라운드로빈 턴제 전투. (승리여부, 로그) 반환."""
    log: list[str] = []
    enemy_artist = display_artist_name(enemies[0]) if enemies else "알 수 없는 아티스트"
    log.append(f"⚔️ 전투 개시! 아군 {len(allies)}기 vs {enemy_artist}의 곡 {len(enemies)}기")

    a_idx = e_idx = 0
    for turn in range(1, MAX_BATTLE_TURNS + 1):
        if not any(u["hp"] > 0 for u in allies) or not any(u["hp"] > 0 for u in enemies):
            break

        # 아군 → 적
        for _ in range(len(allies)):
            attacker = allies[a_idx % len(allies)]
            a_idx += 1
            if attacker["hp"] > 0:
                target = next((e for e in enemies if e["hp"] > 0), None)
                if target:
                    dmg = int(attacker["atk"])
                    target["hp"] -= dmg
                    log.append(
                        f"[T{turn}] 인기도 {attacker['popularity']}의 '{display_track_name(attacker)}' "
                        f"→ {dmg} 데미지!"
                    )
                    if target["hp"] <= 0:
                        log.append(f"  💥 {display_artist_name(target)}의 '{display_track_name(target)}' 격파!")
                break

        if not any(e["hp"] > 0 for e in enemies):
            break

        # 적 → 아군
        for _ in range(len(enemies)):
            attacker = enemies[e_idx % len(enemies)]
            e_idx += 1
            if attacker["hp"] > 0:
                target = next((a for a in allies if a["hp"] > 0), None)
                if target:
                    dmg = int(attacker["atk"])
                    target["hp"] -= dmg
                    log.append(
                        f"[T{turn}] 적 {display_artist_name(attacker)}의 '{display_track_name(attacker)}'"
                        f"(인기도 {attacker['popularity']}) "
                        f"→ {dmg} 반격!"
                    )
                    if target["hp"] <= 0:
                        log.append(f"  ☠️ 아군 '{display_track_name(target)}' 쓰러짐!")
                break

    win = all(u["hp"] <= 0 for u in enemies) and any(u["hp"] > 0 for u in allies)
    log.append("🎉 승리!" if win else "💀 패배...")
    return win, log


# ==================== 세션 ====================
SESSIONS: dict[str, dict] = {}


def get_session(sid: str) -> dict:
    if sid not in SESSIONS:
        raise HTTPException(404, detail={"error": "SESSION_NOT_FOUND"})
    return SESSIONS[sid]


def public_state(state: dict) -> dict:
    """클라이언트에 노출할 상태 (다음 레벨업 임계값 포함)."""
    next_threshold = (
        LEVEL_THRESHOLDS[state["level"]] if state["level"] < MAX_LEVEL else None
    )
    return {**state, "next_level_exp": next_threshold, "max_board_size": state["level"]}


# ==================== 요청 모델 ====================
class PersonaSelect(BaseModel):
    artist_id: str


class BuyReq(BaseModel):
    track_id: str


class SellReq(BaseModel):
    unit_id: str


# ==================== FastAPI ====================
app = FastAPI(title="Spotify Chess API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/game/new")
def new_game():
    """새 게임 생성. 페르소나 후보 3명 반환."""
    sid = uuid.uuid4().hex[:8]
    candidates = random.sample(GAME_DATA["artists"], 3)
    SESSIONS[sid] = {
        "session_id": sid,
        "phase": "persona_select",
        "round": 0,
        "hearts": START_HEARTS,
        "gold": START_GOLD,
        "level": 1,
        "exp": 0,
        "artist_id": None,
        "artist_name": None,
        "artist_name_kr": None,
        "profile_image": None,
        "genre": None,
        "shop": [],
        "board": [],
        "last_battle_log": None,
        "last_result": None,
        "_candidate_ids": [a["artist_id"] for a in candidates],
    }
    return {
        "session_id": sid,
        "candidates": [
            {
                "artist_id": a["artist_id"],
                "artist_name": a["artist_name"],
                "artist_name_kr": a.get("artist_name_kr"),
                "profile_image": a.get("profile_image"),
                "genre": a.get("genre"),
                "sample_popularity": [t["popularity"] for t in a["tracks"][:5]],
                "avg_popularity": round(
                    sum(t["popularity"] for t in a["tracks"]) / len(a["tracks"]), 1
                ),
            }
            for a in candidates
        ],
    }


@app.post("/game/{sid}/persona")
def select_persona(sid: str, req: PersonaSelect):
    state = get_session(sid)
    if state["phase"] != "persona_select":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})
    if req.artist_id not in state["_candidate_ids"]:
        raise HTTPException(400, detail={"error": "INVALID_ARTIST"})

    artist = ARTISTS_BY_ID[req.artist_id]
    state["artist_id"] = req.artist_id
    state["artist_name"] = artist["artist_name"]
    state["artist_name_kr"] = artist.get("artist_name_kr")
    state["profile_image"] = artist.get("profile_image")
    state["genre"] = artist.get("genre")
    state["round"] = 1
    state["phase"] = "shop"
    refresh_shop(state)
    return public_state(state)


@app.post("/game/{sid}/buy")
def buy(sid: str, req: BuyReq):
    state = get_session(sid)
    if state["phase"] != "shop":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})
    if state["gold"] < BUY_COST:
        raise HTTPException(400, detail={"error": "NOT_ENOUGH_GOLD"})
    if len(state["board"]) >= state["level"]:
        raise HTTPException(400, detail={"error": "BOARD_FULL"})

    track = next((t for t in state["shop"] if t["track_id"] == req.track_id), None)
    if not track:
        raise HTTPException(400, detail={"error": "TRACK_NOT_IN_SHOP"})

    state["gold"] -= BUY_COST
    state["board"].append(make_unit_from_track(track))
    state["shop"] = [t for t in state["shop"] if t["track_id"] != req.track_id]
    return public_state(state)


@app.post("/game/{sid}/sell")
def sell(sid: str, req: SellReq):
    state = get_session(sid)
    if state["phase"] != "shop":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})

    unit = next((u for u in state["board"] if u["unit_id"] == req.unit_id), None)
    if not unit:
        raise HTTPException(400, detail={"error": "UNIT_NOT_FOUND"})

    state["board"] = [u for u in state["board"] if u["unit_id"] != req.unit_id]
    state["gold"] += SELL_REFUND
    return public_state(state)


@app.post("/game/{sid}/reroll")
def reroll(sid: str):
    state = get_session(sid)
    if state["phase"] != "shop":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})
    if state["gold"] < REROLL_COST:
        raise HTTPException(400, detail={"error": "NOT_ENOUGH_GOLD"})

    state["gold"] -= REROLL_COST
    refresh_shop(state)
    return public_state(state)


@app.post("/game/{sid}/buy_exp")
def buy_exp(sid: str):
    state = get_session(sid)
    if state["phase"] != "shop":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})
    if state["level"] >= MAX_LEVEL:
        raise HTTPException(400, detail={"error": "MAX_LEVEL_REACHED"})
    if state["gold"] < EXP_BUY_COST:
        raise HTTPException(400, detail={"error": "NOT_ENOUGH_GOLD"})

    state["gold"] -= EXP_BUY_COST
    state["exp"] += EXP_BUY_AMOUNT
    try_level_up(state)
    return public_state(state)


@app.post("/game/{sid}/start_combat")
def start_combat(sid: str):
    state = get_session(sid)
    if state["phase"] != "shop":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})
    if not state["board"]:
        raise HTTPException(400, detail={"error": "EMPTY_BOARD"})

    # 보드 유닛 복사 (전투 중 HP 변동이 영구 반영되지 않도록)
    allies = [dict(u) for u in state["board"]]
    enemies = spawn_enemies(state["artist_id"], state["round"])
    win, log = simulate_battle(allies, enemies)

    state["phase"] = "result"
    state["last_battle_log"] = log
    state["last_result"] = "win" if win else "loss"

    if win:
        state["gold"] += WIN_BONUS_GOLD
    else:
        state["hearts"] -= 1

    # 게임 종료 판정
    if state["hearts"] <= 0:
        state["phase"] = "game_over"
    elif state["round"] >= MAX_ROUND and win:
        state["phase"] = "clear"

    return public_state(state)


@app.post("/game/{sid}/next_round")
def next_round(sid: str):
    state = get_session(sid)
    if state["phase"] != "result":
        raise HTTPException(400, detail={"error": "INVALID_PHASE"})

    state["round"] += 1
    state["gold"] += ROUND_INCOME
    state["exp"] += ROUND_EXP_GAIN
    try_level_up(state)
    heal_board(state)
    refresh_shop(state)
    state["phase"] = "shop"
    state["last_battle_log"] = None
    state["last_result"] = None
    return public_state(state)


@app.get("/game/{sid}")
def get_state(sid: str):
    return public_state(get_session(sid))


@app.get("/api")
def api_root():
    return {
        "service": "Spotify Chess API",
        "concept": "유명할수록 약하고, 무명일수록 강하다.",
        "endpoints": [
            "POST /game/new",
            "POST /game/{sid}/persona",
            "POST /game/{sid}/buy",
            "POST /game/{sid}/sell",
            "POST /game/{sid}/reroll",
            "POST /game/{sid}/buy_exp",
            "POST /game/{sid}/start_combat",
            "POST /game/{sid}/next_round",
            "GET  /game/{sid}",
        ],
    }


@app.get("/")
def frontend_root():
    return FileResponse(PUBLIC_PATH / "index.html")


app.mount("/assets", StaticFiles(directory=ASSETS_PATH), name="assets")
app.mount("/", StaticFiles(directory=PUBLIC_PATH, html=True), name="frontend")
