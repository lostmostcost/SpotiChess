# Spotify Chess Backend 해커톤(6시간) 가이드

본 문서는 **6시간 내 데모 완성**을 목표로 한 백엔드 압축 가이드입니다.  
핵심은 "기획 의도는 살리고, 구현 범위는 극단적으로 줄이는 것"입니다.

---

## 0) 성공 기준 (6시간 버전)

아래 4개가 되면 성공입니다.

1. Spotify 아티스트/트랙 샘플 데이터를 로드할 수 있다.
2. 트랙 1개를 게임 유닛 스탯으로 변환할 수 있다.
3. 상점 롤 결과(3~5개 유닛 후보)를 API로 반환할 수 있다.
4. 더미 전투(양 팀 총 전투력 비교) 결과를 API로 반환할 수 있다.

> 중요: 해커톤에서는 "완성도 높은 엔진"보다 "돌아가는 루프"가 우선입니다.

---

## 1) 기술 범위 강제 축소

### 반드시 포함 (필수)

- `FastAPI`
- 인메모리 저장 또는 SQLite (`PostgreSQL/Redis`는 선택)
- Spotify 연동 1가지 방식
  - A안: 실제 API 호출 20~50건
  - B안: 미리 저장한 JSON fixture 사용

### 이번엔 제외 (과감히 포기)

- 로그인/인증
- 비동기 PvP 매칭
- 실시간 랭킹
- 복잡한 시너지 전투 로직(기절, 부활, 위치 계산)
- 운영용 배치/워커

---

## 2) 최소 디렉토리 구조 (AI 생성 친화형)

```text
backend/
  app/
    main.py
    schemas.py
    sample_data.py
    services/
      mapper.py
      shop.py
      battle.py
  tests/
    test_mapper.py
  requirements.txt
  BACKEND_GUIDE.md
```

파일 수를 줄이면 AI가 더 정확하게 코드를 생성/수정합니다.

---

## 3) 6시간 타임박스 플랜

### 0:00 - 0:45 (환경/뼈대)

- FastAPI 서버 실행
- `/health` 엔드포인트 추가
- Pydantic 스키마(`TrackInput`, `UnitStats`, `BattleResult`) 생성

### 0:45 - 2:00 (메타데이터 -> 스탯 변환)

- `mapper.py`에 수식 구현
- `POST /units/compute` 엔드포인트 구현
- 극단값 방어(clamp, 0 division 방지)

### 2:00 - 3:00 (상점 API)

- `sample_data.py`에 트랙 30~100개 준비
- `GET /shop/roll` 구현 (랜덤 5개, 코스트 기반 가중치 선택은 선택)

### 3:00 - 4:00 (더미 전투 API)

- `POST /battle/simulate`
- 팀 A/B 유닛 배열 입력 받아 총합 파워 비교
- 결과: 승자, 점수차, 간단 로그 3줄

### 4:00 - 5:00 (민주화 알고리즘 반영)

- 선택률 패널티 반영 (`selection_rate_percent`)
- 기본값은 하드코딩 dict로 처리(예: `"track_id" -> pick_rate`)

### 5:00 - 6:00 (데모 안정화)

- Swagger에서 시나리오 1회 통과
- 실패 케이스(빈 배열, duration=0, followers=0) 확인
- README/시연 순서 정리

---

## 4) 해커톤용 단순 수식 (MVP)

복잡도를 낮추기 위해 아래만 구현합니다.

### 4.1 기본 파워

```python
power = base_stat * (log10(max(followers, 1)) / log10(max(total_streams, 10)))
power *= (1 - min(max(selection_rate_percent, 0), 95) / 100)
```

### 4.2 HP / 공격속도

```python
duration_sec = max(duration_ms / 1000, 30)
hp = base_hp * clamp(duration_sec / 180, 0.5, 1.5)  # 긴 곡일수록 탱커
attack_speed = base_as * clamp(180 / duration_sec, 0.6, 2.0)  # 짧은 곡일수록 빠름
```

### 4.3 코스트

```python
cost = max(1, min(5, ceil(popularity / 20)))
```

### 4.4 Explicit 디버프 확률

```python
proc_chance = (10 + 5 * star_level) if explicit else 0
```

---

## 5) 장르 시너지: "읽기 전용 버프"만

해커톤에서는 **복잡한 전투 효과 구현 금지**.  
대신 유닛 상세 정보에 "시너지 태그"만 붙이고, 파워에 작은 보정만 적용합니다.

```python
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
```

권장 보정(단순):

- K-Pop: `+5% attack_speed`
- Hip-Hop: `+5% attack`
- Indie: `+5% lifesteal_meta` (전투 미구현이면 설명값만 반환)
- Rock: `+8% hp`
- EDM: `+3% stun_chance_meta` (설명값)
- Trot: `+1 gold_if_win_meta` (설명값)

---

## 6) API 4개만 만들기

- `GET /health`
- `POST /units/compute`
  - 입력: 트랙 메타데이터 + selection_rate
  - 출력: 계산된 유닛 스탯
- `GET /shop/roll?count=5`
  - 출력: 랜덤 유닛 후보
- `POST /battle/simulate`
  - 입력: team_a[], team_b[]
  - 출력: winner, score_gap, logs[]

---

## 7) 데이터 소스 전략 (해커톤용)

### 1순위: Fixture 우선

- `sample_data.py` 또는 `data/tracks.json`에 30~100개 샘플 저장
- 데모 안정성 최고, 네트워크 이슈 없음

### 2순위: Spotify 라이브 호출 혼합

- 데모 시작 전에 20개만 미리 가져와 캐싱
- 시연 중 실시간 호출 최소화

---

## 8) AI 활용 체크리스트 (실전)

### 프롬프트 전략

- 한 번에 큰 요구 대신, 파일 단위로 지시
- 예시:
  - "`app/schemas.py`에 TrackInput, UnitStats Pydantic 모델만 작성"
  - "`app/services/mapper.py`에 clamp 함수와 compute_unit_stats 함수만 작성"

### 품질 확인 루프

1. AI가 만든 코드 실행
2. Swagger로 API 직접 호출
3. 오류 로그 그대로 AI에 재질문
4. 통과 시 즉시 커밋

---

## 9) 데모 시나리오 (3분)

1. `/shop/roll` 호출 -> 트랙 5개 노출
2. 한 트랙 선택 후 `/units/compute` 호출
3. 선택률 5% vs 60% 두 번 비교 호출
4. `/battle/simulate`로 팀 A/B 결과 표시
5. "비주류 픽이 상대적으로 유리해지는 구조" 설명

---

## 10) 최종 제출 전 체크

- 서버 실행 커맨드 1줄로 정리 (`uvicorn app.main:app --reload`)
- `.env.example` 또는 설정값 기본값 존재
- 에러 시 500 대신 명확한 400 메시지 반환
- 최소 테스트 1개 이상(`test_mapper.py`)
- README에 "이번 버전에서 미구현" 명시

---

## 11) 해커톤 후 확장 로드맵 (짧게)

1. Redis 기반 실시간 selection rate 집계
2. PostgreSQL 마이그레이션 도입
3. 라운드 기반 실제 전투 엔진
4. 장르 시너지의 상태이상/부활/경제효과 정식 구현

---

## 12) 핵심 원칙 한 줄 요약

**이번 목표는 완벽한 게임이 아니라, "Spotify 데이터가 민주화 알고리즘을 거쳐 전투 결과를 바꾸는 흐름"을 6시간 안에 증명하는 것입니다.**

