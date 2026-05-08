"""
Spotify Chess - Backend MVP
역밸런싱 로그라이크: 유명할수록 약하고, 무명일수록 강하다.
"""
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from base64 import b64encode
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ==================== Secrets 로더 ====================
def _load_env_file() -> None:
    env_path = Path(__file__).parent.parent / "Secrets" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _load_spotify_json() -> None:
    """Secrets/spotify.json의 자격증명을 환경변수로 로드한다."""
    secrets_path = Path(__file__).parent.parent / "Secrets" / "spotify.json"
    if not secrets_path.exists():
        return
    try:
        data = json.loads(secrets_path.read_text(encoding="utf-8"))
    except Exception:
        return

    client_id = (
        data.get("SPOTIFY_CLIENT_ID")
        or data.get("spotify_client_id")
        or data.get("client_id")
        or data.get("id")
    )
    client_secret = (
        data.get("SPOTIFY_CLIENT_SECRET")
        or data.get("spotify_client_secret")
        or data.get("client_secret")
        or data.get("secret")
    )

    if client_id:
        os.environ.setdefault("SPOTIFY_CLIENT_ID", str(client_id))
    if client_secret:
        os.environ.setdefault("SPOTIFY_CLIENT_SECRET", str(client_secret))


_load_env_file()
_load_spotify_json()
SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET")

# Spotipy 스타일 access_token 캐시 파일 위치 후보 (.cache, Secrets/.cache)
SPOTIFY_TOKEN_CACHE_PATHS = [
    Path(__file__).parent.parent / ".cache",
    Path(__file__).parent.parent / "Secrets" / ".cache",
]

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
LEVEL_THRESHOLDS = [0, 2, 8]
MAX_LEVEL = 3

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


def public_asset_url(value: Optional[str]) -> Optional[str]:
    """data.json의 로컬 asset 상대 경로를 브라우저에서 접근 가능한 URL로 변환."""
    if not value:
        return None
    if value.startswith(("http://", "https://", "/")):
        return value
    if value.startswith("assets/"):
        return f"/{value}"
    return value


def make_track(track_data: dict, artist_id: str, idx: int) -> dict:
    """data.json의 트랙을 게임용 트랙 객체로 변환"""
    return {
        "track_id": f"{artist_id}_{idx}_{uuid.uuid4().hex[:4]}",
        "track_name": track_data["track_name"],
        "track_name_kr": track_data.get("track_name_kr"),
        "cover_image": public_asset_url(track_data.get("cover_image")),
        "popularity": track_data["popularity"],
        "atk": calc_atk(track_data["popularity"]),
    }


def make_unit_from_track(track: dict) -> dict:
    """상점 트랙을 보드 유닛으로 변환"""
    return {
        "unit_id": uuid.uuid4().hex[:8],
        "track_name": track["track_name"],
        "track_name_kr": track.get("track_name_kr"),
        "cover_image": public_asset_url(track.get("cover_image")),
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
            "profile_image": public_asset_url(enemy_artist.get("profile_image")),
            "genre": enemy_artist.get("genre"),
            "track_name": track_data["track_name"],
            "track_name_kr": track_data.get("track_name_kr"),
            "cover_image": public_asset_url(track_data.get("cover_image")),
            "popularity": pop,
            "hp": max_hp,
            "max_hp": max_hp,
            "atk": calc_atk(pop),
        })
    return enemies


def heal_board(state: dict) -> None:
    for u in state["board"]:
        u["hp"] = u["max_hp"]


def simulate_battle(allies: list[dict], enemies: list[dict]) -> tuple[bool, list[str], list[dict]]:
    """라운드로빈 턴제 전투. (승리여부, 로그, 이벤트목록) 반환."""
    log: list[str] = []
    events: list[dict] = []
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
                    events.append({
                        "type": "attack",
                        "attacker_id": attacker["unit_id"],
                        "attacker_side": "ally",
                        "target_id": target["unit_id"],
                        "dmg": dmg,
                        "target_hp_after": target["hp"],
                    })
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
                    events.append({
                        "type": "attack",
                        "attacker_id": attacker["unit_id"],
                        "attacker_side": "enemy",
                        "target_id": target["unit_id"],
                        "dmg": dmg,
                        "target_hp_after": target["hp"],
                    })
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
    return win, log, events


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
        "last_battle_events": None,
        "last_enemy_units_initial": None,
        "last_result": None,
        "last_enemy_artist": None,
        "_candidate_ids": [a["artist_id"] for a in candidates],
    }
    return {
        "session_id": sid,
        "candidates": [
            {
                "artist_id": a["artist_id"],
                "artist_name": a["artist_name"],
                "artist_name_kr": a.get("artist_name_kr"),
                "profile_image": public_asset_url(a.get("profile_image")),
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
    state["profile_image"] = public_asset_url(artist.get("profile_image"))
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
    enemy_units_snapshot = [dict(e) for e in enemies]
    win, log, events = simulate_battle(allies, enemies)

    state["phase"] = "result"
    state["last_battle_log"] = log
    state["last_battle_events"] = events
    state["last_enemy_units_initial"] = enemy_units_snapshot
    state["last_result"] = "win" if win else "loss"
    state["last_enemy_artist"] = {
        "artist_id": enemies[0]["artist_id"],
        "artist_name": enemies[0]["artist_name"],
        "artist_name_kr": enemies[0].get("artist_name_kr"),
        "profile_image": enemies[0].get("profile_image"),
        "genre": enemies[0].get("genre"),
    }

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
    state["last_battle_events"] = None
    state["last_enemy_units_initial"] = None
    state["last_result"] = None
    state["last_enemy_artist"] = None
    return public_state(state)


@app.get("/game/{sid}")
def get_state(sid: str):
    return public_state(get_session(sid))


# ==================== Spotify 미리듣기 ====================
_spotify_token_cache: dict = {"token": None, "expires_at": 0.0}
_track_search_cache: dict[str, Optional[dict]] = {}


def _read_token_cache_file() -> Optional[dict]:
    """Spotipy 스타일 .cache 파일을 읽어 만료 안 된 토큰을 반환."""
    for path in SPOTIFY_TOKEN_CACHE_PATHS:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        token = data.get("access_token")
        expires_at = float(data.get("expires_at", 0))
        if token and expires_at > time.time() + 30:
            return {"token": token, "expires_at": expires_at}
    return None


def _request_client_credentials_token() -> dict:
    """.env 자격증명으로 Client Credentials 토큰 발급."""
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        raise HTTPException(500, detail={"error": "SPOTIFY_NOT_CONFIGURED"})
    creds = b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=b"grant_type=client_credentials",
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace") if hasattr(exc, "read") else ""
        raise HTTPException(502, detail={"error": "SPOTIFY_AUTH_FAILED", "msg": f"{exc.code}: {body[:200]}"})
    except Exception as exc:
        raise HTTPException(502, detail={"error": "SPOTIFY_AUTH_FAILED", "msg": str(exc)})
    return {
        "token": data["access_token"],
        "expires_at": time.time() + int(data.get("expires_in", 3600)),
    }


def _get_spotify_token() -> str:
    now = time.time()
    # 1) 메모리 캐시
    if _spotify_token_cache["token"] and _spotify_token_cache["expires_at"] > now + 30:
        return _spotify_token_cache["token"]
    # 2) 파일 캐시 (.cache)
    cached = _read_token_cache_file()
    if cached:
        _spotify_token_cache.update(cached)
        return cached["token"]
    # 3) .env 자격증명으로 새로 발급
    fresh = _request_client_credentials_token()
    _spotify_token_cache.update(fresh)
    return fresh["token"]


def _spotify_search_first(query: str, token: str) -> Optional[dict]:
    url = "https://api.spotify.com/v1/search?" + urllib.parse.urlencode(
        {"q": query, "type": "track", "limit": 1}
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
    except Exception:
        return None
    items = data.get("tracks", {}).get("items", [])
    return items[0] if items else None


def _spotify_track_info(artist: str, track: str) -> Optional[dict]:
    key = f"{artist}|{track}".lower()
    if key in _track_search_cache:
        return _track_search_cache[key]

    token = _get_spotify_token()
    item = _spotify_search_first(f'artist:"{artist}" track:"{track}"', token)
    if item is None:
        item = _spotify_search_first(f"{artist} {track}", token)

    if item is None:
        result = None
    else:
        images = item.get("album", {}).get("images") or []
        result = {
            "name": item.get("name"),
            "artist": ", ".join(a["name"] for a in item.get("artists", [])),
            "preview_url": item.get("preview_url"),
            "external_url": item.get("external_urls", {}).get("spotify"),
            "uri": item.get("uri"),
            "duration_ms": item.get("duration_ms"),
            "image": images[0]["url"] if images else None,
        }

    _track_search_cache[key] = result
    return result


@app.get("/spotify/track")
def spotify_track(artist: str, track: str):
    """미리듣기 URL 등 Spotify 트랙 메타데이터 검색."""
    if not artist or not track:
        raise HTTPException(400, detail={"error": "MISSING_QUERY"})
    info = _spotify_track_info(artist, track)
    if not info:
        return {"found": False}
    return {"found": True, **info}


@app.get("/game/{sid}/persona-playlist")
def persona_playlist(sid: str):
    """선택한 페르소나 아티스트의 트랙 목록을 Spotify 미리듣기 플레이리스트로 변환."""
    state = get_session(sid)
    if not state.get("artist_id"):
        raise HTTPException(400, detail={"error": "PERSONA_NOT_SELECTED"})

    artist = ARTISTS_BY_ID[state["artist_id"]]
    artist_name = artist["artist_name"]
    playlist = []

    try:
        for track in artist["tracks"]:
            info = _spotify_track_info(artist_name, track["track_name"])
            playlist.append({
                "track_name": track["track_name"],
                "track_name_kr": track.get("track_name_kr"),
                "cover_image": public_asset_url(track.get("cover_image")),
                "popularity": track["popularity"],
                "found": bool(info),
                "name": info.get("name") if info else track["track_name"],
                "artist": info.get("artist") if info else artist_name,
                "preview_url": info.get("preview_url") if info else None,
                "external_url": info.get("external_url") if info else None,
                "uri": info.get("uri") if info else None,
                "duration_ms": info.get("duration_ms") if info else None,
                "image": info.get("image") if info else public_asset_url(track.get("cover_image")),
            })
    except HTTPException as exc:
        if exc.detail.get("error") == "SPOTIFY_NOT_CONFIGURED":
            return {
                "configured": False,
                "artist_id": artist["artist_id"],
                "artist_name": artist_name,
                "artist_name_kr": artist.get("artist_name_kr"),
                "tracks": [],
            }
        raise

    return {
        "configured": True,
        "artist_id": artist["artist_id"],
        "artist_name": artist_name,
        "artist_name_kr": artist.get("artist_name_kr"),
        "tracks": playlist,
    }


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
