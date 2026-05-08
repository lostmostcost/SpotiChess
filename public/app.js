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

const app = document.querySelector("#app");

const state = {
  artists: [],
  candidateArtists: [],
  selectedArtist: null,
  phase: "loading",
  shop: [],
  selectedUnitId: null,
  player: {
    hearts: 3,
    gold: GAME_CONFIG.startingGold,
    level: 1,
    exp: 0,
    round: 1,
    board: []
  },
  lastResult: null,
  toast: ""
};

function calculateAttack(popularity) {
  return GAME_CONFIG.baseAtk * (3 - 2 * (popularity / 100));
}

function createUnit(track) {
  return {
    ...track,
    instance_id: `${track.track_id}-${crypto.randomUUID()}`,
    hp: GAME_CONFIG.baseHp,
    atk: calculateAttack(track.popularity)
  };
}

function averagePopularity(artist) {
  const total = artist.tracks.reduce((sum, track) => sum + track.popularity, 0);
  return Math.round(total / artist.tracks.length);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAtk(value) {
  return Number(value).toFixed(1);
}

function sampleItems(items, count) {
  if (items.length === 0) {
    return [];
  }

  const pool = [...items];
  const result = [];

  while (result.length < count) {
    if (pool.length === 0) {
      result.push(items[Math.floor(Math.random() * items.length)]);
      continue;
    }

    const index = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }

  return result;
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2400);
}

function getNextLevel(exp) {
  let level = 1;

  for (const [levelKey, threshold] of Object.entries(GAME_CONFIG.levelExpThresholds)) {
    if (exp >= threshold) {
      level = Number(levelKey);
    }
  }

  return Math.min(level, GAME_CONFIG.maxLevel);
}

function refreshShop({ charge = false } = {}) {
  if (!state.selectedArtist) {
    return;
  }

  if (charge) {
    if (state.player.gold < GAME_CONFIG.rerollCost) {
      showToast("골드가 부족해 상점을 새로고침할 수 없습니다.");
      return;
    }
    state.player.gold -= GAME_CONFIG.rerollCost;
  }

  state.shop = sampleItems(state.selectedArtist.tracks, 5);
  render();
}

function startGame(artistId) {
  const artist = state.artists.find((item) => item.artist_id === artistId);

  if (!artist) {
    return;
  }

  state.selectedArtist = artist;
  state.phase = "shop";
  state.shop = sampleItems(artist.tracks, 5);
  render();
}

function buyTrack(trackId) {
  const track = state.shop.find((item) => item.track_id === trackId);

  if (!track) {
    return;
  }

  if (state.player.gold < GAME_CONFIG.unitCost) {
    showToast("골드가 부족합니다.");
    return;
  }

  if (state.player.board.length >= state.player.level) {
    showToast(`현재 레벨에서는 최대 ${state.player.level}개만 배치할 수 있습니다.`);
    return;
  }

  const unit = createUnit(track);
  state.player.gold -= GAME_CONFIG.unitCost;
  state.player.board.push(unit);
  state.selectedUnitId = unit.instance_id;
  showToast(`${track.track_name}을(를) 보드에 배치했습니다.`);
}

function selectUnit(unitId) {
  state.selectedUnitId = unitId;
  render();
}

function sellSelectedUnit() {
  if (!state.selectedUnitId) {
    showToast("판매할 기물을 선택하세요.");
    return;
  }

  const unit = state.player.board.find((item) => item.instance_id === state.selectedUnitId);
  state.player.board = state.player.board.filter((item) => item.instance_id !== state.selectedUnitId);
  state.player.gold += GAME_CONFIG.sellRefund;
  state.selectedUnitId = null;
  showToast(`${unit.track_name}을(를) 판매하고 ${GAME_CONFIG.sellRefund} Gold를 돌려받았습니다.`);
}

function buyExp() {
  if (state.player.gold < GAME_CONFIG.buyExpCost) {
    showToast("골드가 부족해 EXP를 구매할 수 없습니다.");
    return;
  }

  if (state.player.level >= GAME_CONFIG.maxLevel) {
    showToast("이미 최대 레벨입니다.");
    return;
  }

  state.player.gold -= GAME_CONFIG.buyExpCost;
  state.player.exp += GAME_CONFIG.buyExpAmount;
  state.player.level = getNextLevel(state.player.exp);
  render();
}

function getEnemyStats(round) {
  return {
    name: "대중음악 차트 괴물",
    hp: 80 + round * 35,
    atk: 8 + round * 5
  };
}

function runBattle() {
  if (state.player.board.length === 0) {
    showToast("전투에 참여할 곡을 먼저 구매하세요.");
    return;
  }

  state.phase = "combat";
  render();

  window.setTimeout(() => {
    const result = simulateBattle();
    state.lastResult = result;
    state.phase = "resolution";

    if (result.won) {
      state.player.gold += GAME_CONFIG.winBonusGold;
    } else {
      state.player.hearts -= 1;
    }

    if (state.player.hearts <= 0) {
      state.phase = "gameOver";
    } else if (result.won && state.player.round >= GAME_CONFIG.maxRound) {
      state.phase = "clear";
    }

    render();
  }, 900);
}

function simulateBattle() {
  const enemy = getEnemyStats(state.player.round);
  const allyUnits = state.player.board.map((unit) => ({ ...unit, hp: GAME_CONFIG.baseHp }));
  let enemyHp = enemy.hp;
  const logs = [];
  let turn = 1;

  while (turn <= 15 && enemyHp > 0 && allyUnits.some((unit) => unit.hp > 0)) {
    const livingUnits = allyUnits.filter((unit) => unit.hp > 0);

    for (const unit of livingUnits) {
      enemyHp -= unit.atk;
      logs.push(
        `인기도 ${unit.popularity}의 ${unit.track_name}이(가) ${formatAtk(unit.atk)}의 데미지를 뿜어냅니다.`
      );

      if (enemyHp <= 0) {
        break;
      }
    }

    if (enemyHp <= 0) {
      break;
    }

    const target = allyUnits.find((unit) => unit.hp > 0);
    target.hp -= enemy.atk;
    logs.push(`${enemy.name}이(가) ${target.track_name}을(를) 공격했습니다.`);
    turn += 1;
  }

  const won = enemyHp <= 0;
  const allyPower = state.player.board.reduce((sum, unit) => sum + unit.atk, 0);

  return {
    won,
    enemy,
    enemyRemainingHp: Math.max(0, enemyHp),
    allyPower,
    turns: turn,
    logs: logs.slice(-7)
  };
}

function advanceRound() {
  if (!state.lastResult) {
    return;
  }

  state.player.round += 1;
  state.player.gold += GAME_CONFIG.roundIncome;
  state.player.exp += GAME_CONFIG.roundExpGain;
  state.player.level = getNextLevel(state.player.exp);
  state.selectedUnitId = null;
  state.lastResult = null;
  state.phase = "shop";
  state.shop = sampleItems(state.selectedArtist.tracks, 5);
  render();
}

function restartGame() {
  state.selectedArtist = null;
  state.phase = "start";
  state.shop = [];
  state.selectedUnitId = null;
  state.lastResult = null;
  state.toast = "";
  state.player = {
    hearts: 3,
    gold: GAME_CONFIG.startingGold,
    level: 1,
    exp: 0,
    round: 1,
    board: []
  };
  state.candidateArtists = sampleItems(state.artists, 3);
  render();
}

function getSelectedUnit() {
  return state.player.board.find((unit) => unit.instance_id === state.selectedUnitId) ?? null;
}

function imageTag(src, alt, className) {
  if (!src) {
    return `<div class="${className}" role="img" aria-label="${escapeHtml(alt)}"></div>`;
  }

  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function renderStartScreen() {
  app.innerHTML = `
    <section class="start-screen">
      <div class="start-shell">
        <div class="hero">
          <p class="eyebrow">Spotify Chess</p>
          <h1>Less Popular,<br />More Powerful</h1>
          <p class="hero-copy">
            페르소나 아티스트를 선택하세요. 이후 상점에는 해당 아티스트의 곡만 등장하며,
            앨범 커버가 체스 기물이 되어 차트 괴물과 싸웁니다.
          </p>
        </div>
        <div class="artist-grid">
          ${state.candidateArtists.map(renderArtistCard).join("")}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-artist-id]").forEach((button) => {
    button.addEventListener("click", () => startGame(button.dataset.artistId));
  });
}

function renderArtistCard(artist) {
  const avg = averagePopularity(artist);

  return `
    <button class="artist-card" data-artist-id="${escapeHtml(artist.artist_id)}">
      ${imageTag(artist.artist_image_url, `${artist.artist_name} artist image`, "artist-image")}
      <span class="pill strong">페르소나 선택</span>
      <div>
        <h2>${escapeHtml(artist.artist_name)}</h2>
        <div class="artist-meta">
          <span>${artist.tracks.length} tracks</span>
          <span>Avg POP ${avg}</span>
        </div>
      </div>
    </button>
  `;
}

function renderGameScreen() {
  const selectedUnit = getSelectedUnit();

  app.innerHTML = `
    <main class="game-screen">
      ${renderHud()}
      <div class="main-layout">
        <section class="board-section">
          <div class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Board</p>
                <h2>앨범 커버 기물</h2>
                <p class="muted">현재 레벨 ${state.player.level}: 최대 ${state.player.level}개 배치 가능</p>
              </div>
              <span class="pill">${state.player.board.length}/${state.player.level} deployed</span>
            </div>
            <div class="board">
              ${renderBoardSlots()}
            </div>
          </div>
          <div class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Battle Log</p>
                <h3>최근 전투 기록</h3>
              </div>
            </div>
            ${renderBattleLog()}
          </div>
        </section>
        <aside class="side-stack">
          <section class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Shop</p>
                <h2>이번 라운드 트랙</h2>
              </div>
              <span class="pill">3 Gold</span>
            </div>
            <div class="shop-grid">
              ${state.shop.map(renderTrackCard).join("")}
            </div>
          </section>
          <section class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Actions</p>
                <h3>턴 조작</h3>
              </div>
            </div>
            <div class="actions">
              <button class="button" id="startBattle">전투 시작</button>
              <button class="button secondary" id="rerollShop">상점 리롤 - 1 Gold</button>
              <button class="button secondary" id="buyExp">EXP 구매 - 4 Gold</button>
              <button class="button danger" id="sellUnit" ${selectedUnit ? "" : "disabled"}>선택 기물 판매</button>
            </div>
          </section>
          <section class="panel">
            ${renderUnitDetail(selectedUnit)}
          </section>
        </aside>
      </div>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </main>
  `;

  bindGameEvents();
}

function renderHud() {
  return `
    <header class="hud">
      <div class="hud-card artist-chip">
        ${imageTag(state.selectedArtist.artist_image_url, state.selectedArtist.artist_name, "artist-chip-image")}
        <div>
          <span>Persona</span>
          <strong>${escapeHtml(state.selectedArtist.artist_name)}</strong>
        </div>
      </div>
      <div class="hud-card"><span>Round</span><strong>${state.player.round}/${GAME_CONFIG.maxRound}</strong></div>
      <div class="hud-card"><span>Heart</span><strong>${"♥".repeat(state.player.hearts)}</strong></div>
      <div class="hud-card"><span>Gold</span><strong>${state.player.gold}</strong></div>
      <div class="hud-card"><span>Level</span><strong>Lv. ${state.player.level}</strong></div>
      <div class="hud-card"><span>EXP</span><strong>${state.player.exp}</strong></div>
    </header>
  `;
}

function renderBoardSlots() {
  const slots = [];

  for (let index = 0; index < GAME_CONFIG.maxLevel; index += 1) {
    const unit = state.player.board[index];
    const isLocked = index >= state.player.level;

    slots.push(`
      <div class="board-slot">
        ${
          unit
            ? renderUnitCard(unit)
            : `<div class="empty-slot">${isLocked ? "레벨업 시 잠금 해제" : "상점에서 곡을 구매하세요"}</div>`
        }
      </div>
    `);
  }

  return slots.join("");
}

function renderUnitCard(unit) {
  const isSelected = unit.instance_id === state.selectedUnitId;
  const powerfulClass = unit.popularity <= 20 ? "powerful" : "";

  return `
    <button class="unit-card ${isSelected ? "selected" : ""} ${powerfulClass}" data-unit-id="${escapeHtml(unit.instance_id)}">
      ${imageTag(unit.album_cover_url, `${unit.track_name} album cover`, "unit-cover")}
      <div>
        <p class="card-title">${escapeHtml(unit.track_name)}</p>
        <p class="card-subtitle">${escapeHtml(unit.album_name ?? "Unknown Album")}</p>
        <div class="stat-row">
          <span class="pill">POP ${unit.popularity}</span>
          <span class="pill strong">ATK ${formatAtk(unit.atk)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderTrackCard(track) {
  const canBuy = state.player.gold >= GAME_CONFIG.unitCost && state.player.board.length < state.player.level;
  const atk = calculateAttack(track.popularity);

  return `
    <button class="track-card" data-track-id="${escapeHtml(track.track_id)}" ${canBuy ? "" : "disabled"}>
      ${imageTag(track.album_cover_url, `${track.track_name} album cover`, "cover")}
      <div>
        <p class="card-title">${escapeHtml(track.track_name)}</p>
        <p class="card-subtitle">${escapeHtml(track.album_name ?? "Unknown Album")}</p>
        <div class="stat-row">
          <span class="pill">POP ${track.popularity}</span>
          <span class="pill strong">ATK ${formatAtk(atk)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderUnitDetail(unit) {
  if (!unit) {
    return `
      <p class="eyebrow">Unit Detail</p>
      <h3>기물을 선택하세요</h3>
      <p class="muted">보드 위 앨범 커버를 클릭하면 곡의 인기도와 공격력을 확인할 수 있습니다.</p>
    `;
  }

  return `
    <p class="eyebrow">Unit Detail</p>
    ${imageTag(unit.album_cover_url, `${unit.track_name} album cover`, "detail-cover")}
    <h3>${escapeHtml(unit.track_name)}</h3>
    <p class="muted">${escapeHtml(unit.album_name ?? "Unknown Album")}</p>
    <div class="stat-row">
      <span class="pill">HP ${unit.hp}</span>
      <span class="pill">Popularity ${unit.popularity}</span>
      <span class="pill strong">ATK ${formatAtk(unit.atk)}</span>
    </div>
    <p class="muted" style="margin-top: 14px;">
      ${unit.popularity <= 20 ? "무명 곡의 반격이 강력합니다." : "유명한 곡일수록 이 게임에서는 힘이 줄어듭니다."}
    </p>
  `;
}

function renderBattleLog() {
  const logs = state.lastResult?.logs ?? [
    "아직 전투 기록이 없습니다.",
    "인기도가 낮은 곡은 더 높은 공격력을 가집니다."
  ];

  return `
    <ul class="log-list">
      ${logs.map((log) => `<li>${escapeHtml(log)}</li>`).join("")}
    </ul>
  `;
}

function renderCombatOverlay() {
  app.innerHTML = `
    <main class="game-screen">
      ${renderHud()}
      <div class="overlay">
        <div class="result-card">
          <p class="eyebrow">Combat</p>
          <h2>차트 괴물과 전투 중</h2>
          <p class="muted">앨범 커버 기물들이 자동으로 공격을 교환하고 있습니다.</p>
        </div>
      </div>
    </main>
  `;
}

function renderResolution() {
  const result = state.lastResult;
  const title = result.won ? "승리했습니다" : "패배했습니다";
  const copy = result.won
    ? `승리 보너스 ${GAME_CONFIG.winBonusGold} Gold를 획득했습니다.`
    : "하트 1개를 잃었습니다. 다음 라운드에서 더 강한 무명곡을 찾아보세요.";

  app.innerHTML = `
    <main class="game-screen">
      ${renderHud()}
      <div class="overlay">
        <div class="result-card">
          <p class="eyebrow">Resolution</p>
          <h2>${title}</h2>
          <p class="muted">${copy}</p>
          <div class="score-grid">
            <div class="score">
              <span>Ally Power</span>
              <strong>${formatAtk(result.allyPower)}</strong>
            </div>
            <div class="score">
              <span>Enemy HP Left</span>
              <strong>${Math.ceil(result.enemyRemainingHp)}</strong>
            </div>
          </div>
          ${renderBattleLog()}
          <button class="button" id="nextRound" style="margin-top: 18px;">다음 라운드</button>
        </div>
      </div>
    </main>
  `;

  document.querySelector("#nextRound").addEventListener("click", advanceRound);
}

function renderEndScreen(kind) {
  const clear = kind === "clear";

  app.innerHTML = `
    <section class="end-screen">
      <div class="end-card">
        <p class="eyebrow">${clear ? "Clear" : "Game Over"}</p>
        <h1>${clear ? "차트 밖의 승리" : "차트에 삼켜졌습니다"}</h1>
        <p class="hero-copy">
          ${
            clear
              ? "10라운드를 버텼습니다. 덜 유명한 곡들이 가장 강한 무대가 되었습니다."
              : "하트가 모두 사라졌습니다. 다음 시도에서는 더 낮은 인기도의 트랙을 찾아보세요."
          }
        </p>
        <button class="button" id="restartGame" style="margin-top: 24px;">새 게임 시작</button>
      </div>
    </section>
  `;

  document.querySelector("#restartGame").addEventListener("click", restartGame);
}

function bindGameEvents() {
  document.querySelectorAll("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => buyTrack(button.dataset.trackId));
  });

  document.querySelectorAll("[data-unit-id]").forEach((button) => {
    button.addEventListener("click", () => selectUnit(button.dataset.unitId));
  });

  document.querySelector("#startBattle").addEventListener("click", runBattle);
  document.querySelector("#rerollShop").addEventListener("click", () => refreshShop({ charge: true }));
  document.querySelector("#buyExp").addEventListener("click", buyExp);
  document.querySelector("#sellUnit").addEventListener("click", sellSelectedUnit);
}

function render() {
  if (state.phase === "loading") {
    return;
  }

  if (state.phase === "start") {
    renderStartScreen();
  } else if (state.phase === "shop") {
    renderGameScreen();
  } else if (state.phase === "combat") {
    renderCombatOverlay();
  } else if (state.phase === "resolution") {
    renderResolution();
  } else if (state.phase === "gameOver") {
    renderEndScreen("gameOver");
  } else if (state.phase === "clear") {
    renderEndScreen("clear");
  }
}

async function boot() {
  try {
    const response = await fetch("./data.json");

    if (!response.ok) {
      throw new Error("Failed to load data.json");
    }

    const data = await response.json();
    state.artists = data.artists;
    state.candidateArtists = sampleItems(state.artists, 3);
    state.phase = "start";
    render();
  } catch (error) {
    app.innerHTML = `
      <section class="loading-screen">
        <div class="end-card">
          <p class="eyebrow">Error</p>
          <h2>데이터를 불러오지 못했습니다.</h2>
          <p class="muted">${escapeHtml(error.message)}</p>
        </div>
      </section>
    `;
  }
}

boot();
