# Spotify Chess — Backend Implementation Spec

> Claude Code에게 전달하는 백엔드 구현 지시사항.
> **목표:** 프론트엔드와 분리된 FastAPI 기반 REST API 서버 (단일 파일 + 데이터 파일).
> **세션 관리:** 인메모리 dict (단일 플레이어 MVP). DB·인증 없음.

---

## 0. 프로젝트 구조

```
spotify-chess/
├── main.py            # FastAPI 앱 + 게임 로직 전체
├── data.json          # 아티스트 & 트랙 데이터
├── requirements.txt   # fastapi, uvicorn
└── README.md
```

**실행 명령:** `uvicorn main:app --reload --port 8000`

---

## 1. 핵심 상수 (그대로 하드코딩)

```python
# 게임 진행
MAX_ROUND = 10
START_HEARTS = 3
START_GOLD = 10

# 라운드 보상
ROUND_INCOME = 5
WIN_BONUS_GOLD = 1
ROUND_EXP_GAIN = 2

# 상점
SHOP_SIZE = 5
BUY_COST = 3
SELL_REFUND = 3
REROLL_COST = 1
EXP_BUY_COST = 4
EXP_BUY_AMOUNT = 4

# 유닛
BASE_HP = 100
BASE_ATK = 10

# 레벨업 누적 EXP 임계값 (인덱스 = 레벨)
# Lv1→Lv2: 2, Lv2→Lv3: 8, Lv3→Lv4: 20, Lv4→Lv5: 40, Lv5→Lv6: 72
LEVEL_THRESHOLDS = [0, 2, 8, 20, 40, 72]
MAX_LEVEL = 6
```

**역밸런싱 공식:**
```python
def calc_atk(popularity: int) -> float:
    return BASE_ATK * (3 - 2 * popularity / 100)
# popularity=0  → ATK 30 (무명 최강)
# popularity=50 → ATK 20
# popularity=100→ ATK 10 (메가히트 최약)
```

---

## 2. data.json 스키마

```json
{
  "artists": [
    {
      "artist_id": "A001",
      "artist_name": "Unknown Indie Band",
      "tracks": [
        {"track_name": "Dawn in the Room", "popularity": 15},
        ...
      ]
    }
  ]
}
```

**요구사항:** 아티스트 5명, 각 아티스트당 트랙 12개 이상 (상점 5개 슬롯에 충분한 무작위성 확보).
인기도 분포는 아티스트 컨셉에 맞게 (무명밴드는 5~30, 슈퍼스타는 75~98 등).

---

## 3. 데이터 모델 (Pydantic 또는 dataclass)

### Track
```python
{
  "track_id": str,        # f"{artist_id}_{idx}" 형태로 자동 생성
  "track_name": str,
  "popularity": int,      # 0~100
  "atk": float            # calc_atk()로 산출, 소수점 1자리
}
```

### Unit (보드/적 유닛 공통)
```python
{
  "unit_id": str,         # uuid 또는 카운터
  "track_name": str,
  "popularity": int,
  "hp": int,              # 현재 HP
  "max_hp": int,          # = BASE_HP
  "atk": float
}
```

### GameState (서버 인메모리 저장)
```python
{
  "session_id": str,
  "phase": str,           # "persona_select" | "shop" | "combat" | "result" | "game_over" | "clear"
  "round": int,           # 1~10
  "hearts": int,
  "gold": int,
  "level": int,           # 1~6
  "exp": int,             # 누적 EXP
  "artist_id": str|None,  # 선택된 페르소나
  "artist_name": str|None,
  "shop": [Track, ...],   # 현재 상점 슬롯 5개
  "board": [Unit, ...],   # 배치된 아군 유닛 (최대 level 개)
  "last_battle_log": [str, ...] | None,
  "last_result": str|None # "win" | "loss"
}
```

---

## 4. 핵심 로직 함수

### 4.1 레벨업 처리
```python
def try_level_up(state):
    while state.level < MAX_LEVEL and state.exp >= LEVEL_THRESHOLDS[state.level]:
        state.exp -= LEVEL_THRESHOLDS[state.level]
        state.level += 1
```
> EXP는 누적이 아니라 **레벨업 시 차감되는 방식**. 현재 레벨 기준 임계값을 채우면 다음 레벨로.

### 4.2 상점 갱신
```python
def refresh_shop(state):
    artist = find_artist(state.artist_id)
    sampled = random.sample(artist["tracks"], SHOP_SIZE)
    state.shop = [make_track(t, idx) for idx, t in enumerate(sampled)]
```

### 4.3 라운드 시작 처리
- 1라운드: shop 갱신만 수행, 골드/EXP 지급 없음 (시작 골드 10은 게임 생성 시 부여)
- 2라운드 이상: `gold += ROUND_INCOME`, `exp += ROUND_EXP_GAIN`, `try_level_up()`, `refresh_shop()`

### 4.4 적 유닛 생성 (라운드 비례)
```python
def spawn_enemies(round_no: int) -> list[Unit]:
    enemy_count = min(1 + round_no // 2, 6)  # 1라운드 1마리 ~ 10라운드 6마리
    enemies = []
    for i in range(enemy_count):
        # 라운드가 올라갈수록 인기도 높은 (=약하지만 체력은 높은) 차트 괴물
        pop = min(60 + round_no * 3, 95)
        atk = calc_atk(pop)
        hp_bonus = round_no * 15  # 라운드별 체력 보정
        enemies.append({
            "unit_id": f"E{round_no}_{i}",
            "track_name": f"Chart Monster #{i+1}",
            "popularity": pop,
            "hp": BASE_HP + hp_bonus,
            "max_hp": BASE_HP + hp_bonus,
            "atk": atk
        })
    return enemies
```

### 4.5 전투 시뮬레이션
**턴제 라운드로빈 방식, 최대 30턴:**
```python
def simulate_battle(allies, enemies):
    log = []
    turn = 0
    a_idx, e_idx = 0, 0
    while turn < 30 and any(u["hp"] > 0 for u in allies) and any(u["hp"] > 0 for u in enemies):
        # 살아있는 아군 → 살아있는 적 공격
        attacker = next_alive(allies, a_idx)
        target = next_alive(enemies, e_idx)
        if attacker and target:
            target["hp"] -= int(attacker["atk"])
            log.append(f"인기도 {attacker['popularity']}의 '{attacker['track_name']}'(이)가 {int(attacker['atk'])} 데미지를 뿜어냅니다!")
            if target["hp"] <= 0:
                log.append(f"💥 '{target['track_name']}' 격파!")
        # 적 → 아군 반격
        attacker = next_alive(enemies, e_idx)
        target = next_alive(allies, a_idx)
        if attacker and target:
            target["hp"] -= int(attacker["atk"])
            log.append(f"적 '{attacker['track_name']}'(이)가 {int(attacker['atk'])} 데미지!")
        turn += 1

    win = all(u["hp"] <= 0 for u in enemies) and any(u["hp"] > 0 for u in allies)
    return win, log
```

### 4.6 라운드 결과 반영
- **승리:** `gold += WIN_BONUS_GOLD`, 다음 라운드로 (round += 1, 라운드 시작 처리 호출)
- **패배:** `hearts -= 1`. hearts == 0 이면 phase = "game_over". 아니면 다음 라운드.
- **클리어:** round > MAX_ROUND 도달 시 phase = "clear"
- 보드의 유닛 HP는 다음 라운드 시작 시 max_hp로 회복.

---

## 5. REST API 엔드포인트 명세

모든 응답은 변경된 GameState 전체를 JSON으로 반환 (프론트는 이걸로 화면 갱신).

| Method | Path | 설명 | Body |
|--------|------|------|------|
| `POST` | `/game/new` | 새 게임 시작, 페르소나 후보 3명 반환 | - |
| `POST` | `/game/{sid}/persona` | 페르소나 선택, 1라운드 진입 | `{"artist_id": "A001"}` |
| `POST` | `/game/{sid}/buy` | 상점 트랙 구매 → 보드 추가 | `{"track_id": "A001_2"}` |
| `POST` | `/game/{sid}/sell` | 보드 유닛 판매 | `{"unit_id": "..."}` |
| `POST` | `/game/{sid}/reroll` | 상점 리롤 | - |
| `POST` | `/game/{sid}/buy_exp` | EXP 구매 | - |
| `POST` | `/game/{sid}/start_combat` | 전투 시뮬레이션 실행 | - |
| `POST` | `/game/{sid}/next_round` | 결과 확인 후 다음 라운드 진행 | - |
| `GET`  | `/game/{sid}` | 현재 상태 조회 | - |

### 5.1 `POST /game/new` 응답 예시
```json
{
  "session_id": "abc123",
  "candidates": [
    {"artist_id": "A001", "artist_name": "Unknown Indie Band", "sample_popularity": [15, 8, 22]},
    {"artist_id": "A003", "artist_name": "...", "sample_popularity": [...]},
    {"artist_id": "A005", "artist_name": "...", "sample_popularity": [...]}
  ]
}
```

### 5.2 검증 규칙 (각 엔드포인트에서 400 반환 케이스)
- `buy`: 골드 부족 / 보드 가득참 / 트랙이 상점에 없음
- `sell`: 보드에 해당 unit 없음
- `reroll`: 골드 부족
- `buy_exp`: 골드 부족 / 이미 max level
- `start_combat`: 보드 비어있음 / 현재 phase가 shop이 아님
- `next_round`: 현재 phase가 result가 아님

오류 응답:
```json
{"error": "NOT_ENOUGH_GOLD", "message": "골드가 부족합니다"}
```

---

## 6. 구현 순서 (Claude Code 작업 흐름)

1. **`requirements.txt` 작성** → fastapi, uvicorn
2. **`data.json` 생성** → 아티스트 5명 × 트랙 12개+ (직접 작명, 인기도는 아티스트 컨셉에 맞게)
3. **`main.py` 작성:**
   - 상수 정의
   - `load_data()` — 시작 시 data.json 로드
   - `calc_atk()`, `try_level_up()`, `refresh_shop()`, `spawn_enemies()`, `simulate_battle()` 함수 작성
   - 인메모리 `SESSIONS: dict[str, dict]` 선언
   - FastAPI 앱 + 9개 엔드포인트 구현
   - CORS 미들웨어 추가 (프론트 연동 대비, allow_origins=["*"])
4. **`README.md`** — 설치/실행/엔드포인트 요약

---

## 7. 핵심 체크리스트 (구현 후 자가 검증)

- [ ] 페르소나 선택 후 상점은 **그 아티스트의 곡만** 등장하는가?
- [ ] popularity=10 곡의 ATK가 28인가? (`10 * (3 - 0.2)`)
- [ ] popularity=95 곡의 ATK가 11인가? (`10 * (3 - 1.9)`)
- [ ] 1라운드 진입 시 골드 10, 2라운드 진입 시 +5 되어 표시되는가?
- [ ] EXP 누적 2 도달 시 Lv2 (배치 가능 2칸)로 올라가는가?
- [ ] 보드 유닛 수가 현재 레벨을 초과하면 buy 거부되는가?
- [ ] 전투 후 승리 시 +1 골드, 패배 시 -1 heart 적용되는가?
- [ ] hearts=0 시 phase="game_over", round=11 도달 시 phase="clear"인가?
- [ ] battle_log에 "인기도 X의 ... 데미지를 뿜어냅니다!" 텍스트 연출 포함되는가?

---

## 8. 주의사항

- **세션 ID:** `uuid.uuid4().hex[:8]` 정도로 충분.
- **랜덤 시드 고정 X** — 매번 다른 상점이 떠야 함.
- **타입 힌트 적극 사용** — Pydantic 모델로 요청/응답 정의 시 자동 검증됨.
- **에러는 HTTPException(status_code=400, detail={...})** 형태로 일관 반환.
- **전투 로그는 한국어로 출력** — 게임 컨셉(역밸런싱) 체감이 핵심 목표.

이 명세대로 구현하면 6시간 안에 동작하는 백엔드 MVP가 완성됩니다.
