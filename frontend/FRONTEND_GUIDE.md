# Spotify Chess Frontend 해커톤(6시간) 가이드

본 문서는 `Spotify Chess` 기획안을 바탕으로,  
**6시간 내 AI 보조로 구현 가능한 프론트엔드 MVP** 기준을 제공합니다.

핵심 목표는 "완성도 높은 게임 UI"가 아니라,  
**민주화 알고리즘이 UI에서 눈에 보이게 작동함을 증명**하는 것입니다.

---

## 0) 성공 기준 (프론트 6시간)

아래 4개가 되면 성공입니다.

1. 상점 롤 화면에서 유닛 후보(트랙 카드) 5개를 볼 수 있다.
2. 카드 선택 시 유닛 계산 스탯(HP, AS, Power, Cost)을 볼 수 있다.
3. 선택률(픽률) 슬라이더를 조정하면 Power가 바뀌는 것을 즉시 볼 수 있다.
4. 팀 A/B를 구성하고 전투 시뮬레이션 결과(승자/점수차)를 볼 수 있다.

---

## 1) 기술 범위 강제 축소

### 반드시 포함 (필수)

- `React` (가능하면 Vite 기반)
- 스타일: `Tailwind` 또는 간단 CSS 모듈(둘 중 하나만)
- 상태관리: `useState` + `useMemo` 수준 (전역 상태 라이브러리 생략)
- API 연동: 백엔드 4개 엔드포인트만

### 이번엔 제외 (포기)

- 복잡한 애니메이션 전투 연출
- 실시간 멀티플레이 동기화
- 로그인/회원가입
- 라우팅 다중 페이지 구조
- Spotify Web Playback SDK 연동

---

## 2) 최소 디렉토리 구조 (AI 생성 친화형)

```text
frontend/
  src/
    App.tsx
    main.tsx
    api/
      client.ts
    components/
      ShopPanel.tsx
      UnitDetailPanel.tsx
      TeamBuilderPanel.tsx
      BattleResultPanel.tsx
    types/
      game.ts
    styles.css
  .env.example
```

파일 수를 줄이면 AI가 문맥을 덜 잃고 수정 정확도가 올라갑니다.

---

## 3) 화면 구성 (싱글 페이지)

한 페이지에 4개 섹션만 둡니다.

1. **ShopPanel**
   - `상점 새로고침` 버튼
   - 카드 5개 렌더링
   - 카드 클릭 시 "선택된 유닛"으로 전달
2. **UnitDetailPanel**
   - 선택된 카드 정보 표시
   - 선택률 슬라이더(0~95)
   - `스탯 계산` 버튼 -> `/units/compute` 호출
3. **TeamBuilderPanel**
   - Team A, Team B 각각 최대 3유닛
   - `A에 추가`, `B에 추가`, `초기화`
4. **BattleResultPanel**
   - `전투 실행` 버튼 -> `/battle/simulate`
   - winner, score_gap, logs[] 출력

---

## 4) API 계약 (백엔드 가이드와 동일)

프론트는 아래 API만 가정합니다.

- `GET /health`
- `GET /shop/roll?count=5`
- `POST /units/compute`
- `POST /battle/simulate`

### 4.1 프론트 타입 예시

```ts
export type TrackCard = {
  track_id: string;
  name: string;
  artist: string;
  duration_ms: number;
  popularity: number;
  followers: number;
  total_streams: number;
  explicit: boolean;
  genres: string[];
};

export type UnitStats = {
  track_id: string;
  hp: number;
  attack_speed: number;
  power: number;
  cost: number;
  synergy_tags: string[];
};

export type BattleResult = {
  winner: "A" | "B" | "DRAW";
  score_gap: number;
  logs: string[];
};
```

---

## 5) 사용자 플로우 (데모 기준)

1. 앱 진입 -> `상점 새로고침` 클릭
2. 카드 하나 선택
3. 선택률을 5%로 두고 `스탯 계산`
4. 같은 카드로 선택률 60%로 바꿔 다시 계산
5. Power 감소를 시각적으로 강조(색상/배지)
6. 팀 A/B 구성 후 `전투 실행`
7. 결과 카드로 승자와 점수차 노출

---

## 6) UI/UX 규칙 (빠른 구현용)

- 다크 테마 기본 (`#0f1115`, `#151922`, `#aab3c5`)
- 카드 컴포넌트 하나를 재사용
- 숫자는 소수점 1자리 고정
- 상태 색상
  - 상승: 녹색
  - 하락: 빨강
  - 중립: 회색
- 로딩/에러 상태는 각 패널에서 분리 처리

---

## 7) AI와 작업하는 방식 (실전형)

### 7.1 프롬프트 단위

한 번에 한 파일씩 요청:

- "`src/types/game.ts` 타입만 생성해줘"
- "`src/api/client.ts`에 fetch 래퍼와 4개 함수만 만들어줘"
- "`ShopPanel.tsx`에 카드 리스트 + 클릭 이벤트만 구현해줘"

### 7.2 수정 루프

1. AI가 코드 생성
2. 바로 실행 (`npm run dev`)
3. 콘솔 에러를 그대로 AI에 전달
4. 통과하면 다음 파일로 이동

---

## 8) 구현 타임박스 (6시간)

### 0:00 - 0:45 (세팅)

- Vite React 앱 준비
- 기본 레이아웃(4패널)만 배치

### 0:45 - 2:00 (타입 + API)

- `types/game.ts`
- `api/client.ts`
- `/shop/roll` 연동 및 렌더링

### 2:00 - 3:00 (유닛 계산 패널)

- 선택률 슬라이더
- `/units/compute` 연동
- Power 변화 강조 UI

### 3:00 - 4:00 (팀 빌더)

- Team A/B 배열 상태
- 카드 추가/삭제/초기화

### 4:00 - 5:00 (전투 결과)

- `/battle/simulate` 연동
- winner/score_gap/logs 표시

### 5:00 - 6:00 (데모 안정화)

- 에러 핸들링/로딩 상태 정리
- 시연 시나리오 1회 리허설

---

## 9) 최소 코드 규칙

- API URL은 `VITE_API_BASE_URL` 환경변수 사용
- 컴포넌트당 책임 1개
- prop drilling이 심해지면 `App.tsx`에서 핸들러만 전달
- 매직 넘버는 상수화 (`MAX_TEAM_SIZE = 3`, `MAX_PICK_RATE = 95`)

---

## 10) 실패 방지 체크리스트

- 백엔드 미실행 시 안내 문구 표시
- 빈 상점 데이터 대응 (`"표시할 카드가 없습니다"`)
- 팀이 비어 있으면 전투 버튼 비활성화
- 동일 카드 중복 추가 허용 여부를 명시(해커톤에선 허용 권장)
- CORS 문제 발생 시 백엔드 설정 먼저 확인

---

## 11) 데모 발표 스크립트 (1분)

1. "Spotify 메타데이터 기반 카드가 상점에 뜹니다."
2. "선택률을 올리면 민주화 알고리즘으로 파워가 감소합니다."
3. "팀 A/B 편성 후 전투 실행 시 결과가 즉시 계산됩니다."
4. "즉, 비주류 픽이 전략적으로 의미를 갖는 구조를 구현했습니다."

---

## 12) 해커톤 후 확장

1. 전투 애니메이션/타임라인 시각화
2. Spotify 미리듣기(30초) 연동
3. 시너지 효과의 실제 전투 반영
4. 계정/전적/랭킹 시스템

---

## 한 줄 결론

**프론트 MVP는 "상점 -> 스탯 계산 -> 팀 편성 -> 전투 결과" 1개 흐름만 완성하면 충분합니다.**
