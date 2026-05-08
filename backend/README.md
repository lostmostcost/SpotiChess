# Spotify Chess — Backend MVP

역밸런싱 로그라이크: **유명할수록 약하고, 무명일수록 강하다.**

## 설치 & 실행

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

서버 실행 후 `http://localhost:8000/docs` 에서 Swagger UI로 모든 엔드포인트를 테스트할 수 있습니다.

## 게임 흐름

1. `POST /game/new` → session_id와 페르소나 후보 3명 받기
2. `POST /game/{sid}/persona` → 아티스트 선택 (1라운드 진입)
3. shop 페이즈에서 `buy` / `sell` / `reroll` / `buy_exp` 자유롭게 호출
4. `POST /game/{sid}/start_combat` → 전투 시뮬레이션 실행
5. `POST /game/{sid}/next_round` → 다음 라운드 시작
6. 10라운드 클리어 또는 hearts=0 패배까지 반복

## 핵심 공식

```
ATK = 10 × (3 − 2 × popularity / 100)
```

| popularity | ATK |
|-----------:|----:|
| 0 (완전무명) | 30 |
| 50 | 20 |
| 100 (메가히트) | 10 |
