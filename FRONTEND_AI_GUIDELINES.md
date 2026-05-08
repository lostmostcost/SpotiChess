# Spotify Chess Frontend AI Guidelines

이 문서는 `readme.md`의 게임 기획을 바탕으로, 웹 UI 및 프론트엔드 서비스를 개발하는 AI 에이전트가 따라야 할 구현 지침입니다. 목표는 6시간 MVP 범위를 유지하면서도 Spotify를 연상시키는 세련된 음악 기반 체스 로그라이크 경험을 빠르게 만드는 것입니다.

## 1. 제품 방향

### 핵심 컨셉

- 플레이어는 게임 시작 시 3명의 아티스트 중 1명을 페르소나로 선택한다.
- 선택한 아티스트의 곡만 상점에 등장한다.
- 곡은 체스 기물처럼 보드에 배치되는 유닛이다.
- 각 기물의 이미지는 해당 곡의 앨범 커버를 사용한다.
- 유명한 곡일수록 약하고, 무명 곡일수록 강한 역밸런싱을 UI에서 직관적으로 전달한다.
- 플레이어는 상점에서 곡을 구매하고 보드에 배치한 뒤 자동 전투 결과를 확인한다.

### MVP 우선순위

1. 게임 루프가 끝까지 동작해야 한다.
2. 상태 변화가 UI에 명확히 보여야 한다.
3. Spotify풍의 어두운 배경, 네온 그린 포인트, 앨범 커버 중심의 시각 언어를 유지해야 한다.
4. 복잡한 애니메이션보다 구매, 배치, 리롤, 전투 시작, 결과 표시의 명확성을 우선한다.

## 2. 추천 기술 방향

`readme.md`는 Python 단일 스크립트 또는 웹 UI를 추천하지만, 프론트엔드 서비스로 구현할 경우 다음 방향을 우선한다.

- 단일 페이지 앱으로 구현한다.
- 상태는 클라이언트 메모리에 둔다.
- 외부 API 호출 없이 로컬 `data.json` 또는 정적 JSON 데이터를 사용한다.
- 앨범 커버 이미지는 트랙 데이터의 `album_cover_url` 또는 로컬 이미지 경로를 사용한다.
- 라우팅은 MVP에서는 필수 아님. 필요하면 `Start`, `Game`, `Result` 정도의 내부 화면 상태로 처리한다.

권장 데이터 필드:

```json
{
  "artists": [
    {
      "artist_id": "A001",
      "artist_name": "Unknown Indie Band",
      "artist_image_url": "/images/artists/a001.jpg",
      "tracks": [
        {
          "track_id": "T001",
          "track_name": "Dawn in the Room",
          "album_name": "Small Rooms",
          "album_cover_url": "/images/albums/dawn.jpg",
          "popularity": 15
        }
      ]
    }
  ]
}
```

## 3. 화면 구성

### 3.1. 시작 화면

목적: 플레이어가 페르소나 아티스트를 선택한다.

필수 UI:

- 게임 타이틀: `Spotify Chess`
- 서브 카피: `Less Popular, More Powerful`
- 무작위 아티스트 카드 3개
- 각 카드에는 아티스트 이미지, 이름, 대표 트랙 수, 평균 인기도를 표시
- 선택 버튼 또는 카드 클릭 액션

디자인:

- Spotify 앱 첫 화면처럼 어두운 그라데이션 배경을 사용한다.
- 아티스트 카드는 둥근 모서리, 앨범/프로필 이미지, hover 시 살짝 떠오르는 효과를 준다.
- 선택된 카드는 Spotify Green 테두리 또는 글로우로 강조한다.

### 3.2. 메인 게임 화면

목적: 상점, 플레이어 상태, 보드, 전투 진입을 한 화면에서 조작한다.

권장 레이아웃:

- 상단 HUD: 라운드, 하트, 골드, 레벨, EXP
- 중앙 보드: 구매한 곡 기물을 배치하는 영역
- 하단 또는 우측 상점: 현재 상점 슬롯 5개
- 우측 패널: 선택한 유닛 상세 정보, 현재 페르소나 아티스트, 액션 버튼

필수 액션:

- 상점 곡 구매
- 보드 기물 판매
- 상점 리롤
- EXP 구매
- 전투 시작

보드 규칙:

- 배치 가능한 최대 유닛 수는 현재 플레이어 레벨과 동일하다.
- 빈 슬롯은 점선 또는 흐린 카드로 표시한다.
- 기물이 배치되면 앨범 커버를 중심으로 렌더링한다.
- 각 기물 카드에는 트랙명, 인기도, 최종 공격력을 함께 표시한다.

### 3.3. 자동 전투 화면 또는 전투 오버레이

목적: 전투가 자동으로 진행된다는 느낌을 주고 결과를 명확히 전달한다.

MVP에서는 실제 실시간 전투 애니메이션 대신 다음 중 하나로 구현해도 된다.

- 전투 시작 클릭 후 1~2초 로딩 오버레이
- 아군 총 공격력과 적 스탯 비교 카드
- 전투 로그 텍스트 출력

전투 로그 예시:

- `인기도 8의 Coffee and Cigarettes가 28.4의 데미지를 뿜어냅니다.`
- `차트 괴물이 흔들립니다. 무명 곡의 반격이 통했습니다.`
- `유명곡은 빛나지만, 이 게임에서는 약합니다.`

### 3.4. 라운드 결과 화면

필수 표시:

- 승리 또는 패배
- 획득 골드
- 차감된 하트
- 다음 라운드 버튼
- 게임 오버 또는 10라운드 클리어 메시지

## 4. Spotify풍 디자인 시스템

### 색상

다음 토큰을 기준으로 사용한다.

```css
:root {
  --color-bg: #121212;
  --color-surface: #181818;
  --color-surface-elevated: #242424;
  --color-surface-hover: #2a2a2a;
  --color-primary: #1db954;
  --color-primary-hover: #1ed760;
  --color-text: #ffffff;
  --color-text-muted: #b3b3b3;
  --color-danger: #ff4d4f;
  --color-warning: #f5c542;
  --color-border: rgba(255, 255, 255, 0.1);
}
```

### 타이포그래피

- 기본 폰트는 시스템 sans-serif를 사용한다.
- 제목은 굵고 크게, 숫자 HUD는 시인성을 우선한다.
- 트랙명은 최대 1~2줄로 말줄임 처리한다.
- 보조 텍스트는 `--color-text-muted`를 사용한다.

### 카드 스타일

- 배경: `--color-surface` 또는 `--color-surface-elevated`
- 모서리: 12~20px radius
- hover: 배경 밝기 상승, 살짝 위로 이동
- 선택 상태: Spotify Green border 또는 glow
- 비활성 상태: opacity 0.45, 클릭 불가 커서

### 앨범 커버 기물

각 기물은 앨범 커버가 핵심 시각 요소가 되어야 한다.

- 카드 상단 또는 전체 배경에 정사각형 앨범 커버를 표시한다.
- 앨범 커버가 없을 경우 그라데이션 placeholder와 음악 노트 아이콘을 사용한다.
- 보드 위 기물은 작은 체스 말 아이콘보다 앨범 커버를 우선한다.
- 인기도가 낮아 강한 기물은 초록색 오라, 높은 기물은 차분한 회색 오라로 대비를 준다.
- hover 또는 선택 시 앨범 커버가 살짝 확대되는 효과를 줄 수 있다.

## 5. 상태 모델

프론트엔드 상태는 아래 구조를 기준으로 설계한다.

```ts
type GamePhase = "start" | "shop" | "combat" | "resolution" | "gameOver" | "clear";

type Track = {
  track_id: string;
  track_name: string;
  album_name?: string;
  album_cover_url?: string;
  popularity: number;
};

type Unit = Track & {
  instance_id: string;
  hp: number;
  atk: number;
};

type PlayerState = {
  selected_artist_id: string | null;
  hearts: number;
  gold: number;
  level: number;
  exp: number;
  round: number;
  board: Unit[];
};

type GameState = {
  phase: GamePhase;
  player: PlayerState;
  shop: Track[];
  selected_unit_id: string | null;
  last_result?: BattleResult;
};
```

## 6. 하드코딩해야 할 밸런스 상수

`readme.md`의 수치를 그대로 사용한다.

```ts
const GAME_CONFIG = {
  startingGold: 10,
  roundIncome: 5,
  winBonusGold: 1,
  unitCost: 3,
  sellRefund: 3,
  rerollCost: 1,
  buyExpCost: 4,
  buyExpAmount: 4,
  roundExpGain: 2,
  maxRound: 10,
  baseHp: 100,
  baseAtk: 10,
  maxLevel: 6,
  levelExpThresholds: {
    1: 0,
    2: 2,
    3: 8,
    4: 20,
    5: 40,
    6: 72
  }
};
```

공격력 공식:

```ts
function calculateAttack(popularity: number): number {
  return 10 * (3 - 2 * (popularity / 100));
}
```

UI에서는 소수점 1자리 또는 정수 반올림 중 하나를 일관되게 사용한다.

## 7. 핵심 인터랙션 규칙

### 아티스트 선택

- 게임 시작 시 전체 아티스트 목록에서 무작위 3명을 보여준다.
- 선택 즉시 `selected_artist_id`를 저장한다.
- 이후 상점은 해당 아티스트의 `tracks` 안에서만 생성한다.

### 상점 갱신

- 상점은 항상 5개 슬롯을 보여준다.
- 선택한 아티스트의 트랙 목록에서 무작위로 5개를 뽑는다.
- 트랙 수가 5개 미만이면 중복 허용 여부를 명확히 정한다. MVP에서는 중복 허용이 안전하다.
- 리롤 시 골드가 부족하면 버튼을 비활성화하고 간단한 안내를 표시한다.

### 구매

- 곡 구매 비용은 항상 3 Gold다.
- 골드가 부족하면 구매할 수 없다.
- 보드가 현재 레벨 제한만큼 가득 차 있으면 구매할 수 없다.
- 구매한 곡은 `Unit`으로 변환하며 `instance_id`, `hp`, `atk`를 부여한다.

### 판매

- 보드의 기물을 판매하면 3 Gold를 돌려준다.
- 판매 전 확인 모달은 MVP에서는 생략해도 된다.
- 판매 후 선택 상태를 초기화한다.

### EXP 구매와 레벨업

- 4 Gold를 내고 4 EXP를 얻는다.
- 매 라운드 시작 시 1라운드를 제외하고 2 EXP를 자동 획득한다.
- EXP가 임계값에 도달하면 레벨을 갱신한다.
- 레벨은 최대 6이다.

### 전투

- MVP에서는 단순 계산 기반 전투를 허용한다.
- 전투 시작 시 `phase`를 `combat`으로 바꾸고 결과를 계산한다.
- 승리하면 1 Gold 보너스를 지급하고 다음 라운드로 이동한다.
- 패배하면 하트 1개를 차감한다.
- 하트가 0이면 `gameOver`, 10라운드를 클리어하면 `clear`로 전환한다.

## 8. 컴포넌트 설계 가이드

권장 컴포넌트:

- `App`
- `StartScreen`
- `ArtistSelectionCard`
- `GameScreen`
- `TopHud`
- `ShopPanel`
- `ShopTrackCard`
- `Board`
- `BoardSlot`
- `UnitCard`
- `UnitDetailPanel`
- `ActionPanel`
- `CombatOverlay`
- `BattleLog`
- `ResolutionModal`

컴포넌트 원칙:

- 카드 컴포넌트는 재사용 가능하게 만들되, 과한 추상화는 피한다.
- 게임 로직은 가능하면 UI 컴포넌트 밖의 순수 함수로 분리한다.
- 구매, 판매, 리롤, 전투 같은 액션은 단일 상태 업데이트 경로를 갖도록 한다.
- UI 컴포넌트는 계산된 값과 액션 핸들러를 props로 받는다.

## 9. UX 카피 가이드

톤은 음악 서비스와 게임의 중간 지점을 유지한다.

좋은 예:

- `무명일수록 강합니다.`
- `차트 밖의 반격이 시작됩니다.`
- `이 곡은 덜 유명하지만 훨씬 위험합니다.`
- `상점을 새로고침해 다른 트랙을 찾아보세요.`

피해야 할 예:

- 지나치게 긴 설명문
- 실제 Spotify 브랜드 소유권을 암시하는 문구
- 사용자가 이해하기 어려운 내부 수식 노출

## 10. 접근성과 반응형

- 모든 주요 버튼은 키보드 포커스 상태가 보여야 한다.
- 앨범 커버 이미지에는 트랙명 기반 `alt` 텍스트를 제공한다.
- 색상만으로 강약을 표현하지 말고 ATK, popularity 숫자를 함께 표시한다.
- 1024px 이상에서는 보드와 상점을 나란히 배치한다.
- 모바일에서는 상점과 액션 패널을 하단으로 쌓는다.
- 카드 클릭 영역은 충분히 크게 유지한다.

## 11. 구현 시 주의사항

- 외부 Spotify API 연동은 MVP 범위에서 제외한다.
- 실제 Spotify 로고, 상표, 공식 UI를 그대로 복제하지 않는다.
- 디자인은 Spotify에서 영감을 받은 dark music dashboard 스타일로 해석한다.
- 게임 수치는 `readme.md`와 일치시킨다.
- 데이터가 부족해도 UI가 깨지지 않도록 placeholder를 준비한다.
- 랜덤 결과는 플레이마다 달라도 되지만, 디버깅을 위해 로직은 함수 단위로 분리한다.

## 12. 완료 기준

프론트엔드 MVP는 다음을 만족하면 완료로 본다.

- 시작 화면에서 아티스트 3명 중 1명을 선택할 수 있다.
- 선택한 아티스트의 곡만 상점에 등장한다.
- 곡 카드에 앨범 커버, 트랙명, 인기도, 공격력이 표시된다.
- 곡을 구매해 보드에 배치할 수 있다.
- 보드 제한은 플레이어 레벨을 따른다.
- 리롤, EXP 구매, 판매가 동작한다.
- 전투 시작 후 승패가 계산되고 라운드 결과가 표시된다.
- 하트 0 또는 10라운드 클리어 시 최종 화면이 표시된다.
- 전체 UI는 어두운 음악 앱 느낌과 Spotify Green 포인트 컬러를 유지한다.
