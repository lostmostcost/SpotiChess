const app = document.querySelector("#app");

const state = {
  sessionId: null,
  candidates: [],
  game: null,
  selectedUnitId: null,
  phase: "loading",
  combatLogs: [],
  combatDone: false,
  battleSpeed: 1,
  toast: ""
};

const GAME_CONFIG = {
  unitCost: 3,
  sellRefund: 3,
  rerollCost: 1,
  buyExpCost: 4,
  maxLevel: 6,
  maxRound: 10
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHighlightedLog(log) {
  return escapeHtml(log)
    .replace(
      /(vs )([^<]+?)(의 곡)/g,
      '$1<span class="log-artist">$2</span>$3'
    )
    .replace(
      /(적 )([^<]+?)(의 )/g,
      '$1<span class="log-artist">$2</span>$3'
    )
    .replace(
      /(&#039;)(.+?)(&#039;)/g,
      '$1<span class="log-track">$2</span>$3'
    );
}

function slug(value) {
  return encodeURIComponent(String(value ?? "spotify-chess").toLowerCase().replace(/\s+/g, "-"));
}

function artUrl(seed) {
  return `https://picsum.photos/seed/${slug(seed)}/600/600`;
}

function displayArtistName(artist) {
  return artist?.artist_name_kr || artist?.artist_name || "Unknown Artist";
}

function displayTrackName(track) {
  return track?.track_name_kr || track?.track_name || "Unknown Track";
}

function artistImage(artist) {
  return artist?.profile_image || artUrl(artist?.artist_name);
}

function trackImage(track) {
  return track?.cover_image || artUrl(track?.track_name);
}

function formatAtk(value) {
  return Number(value ?? 0).toFixed(1);
}

function normalizePhase(phase) {
  if (phase === "persona_select") return "start";
  if (phase === "result") return "resolution";
  if (phase === "game_over") return "gameOver";
  return phase;
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2500);
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function combatDelay(baseMs) {
  return Math.round(baseMs / state.battleSpeed);
}

function battleSpeedLabel() {
  if (state.battleSpeed <= 0.75) return "느림";
  if (state.battleSpeed >= 1.5) return "빠름";
  return "보통";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorCode = payload?.detail?.error ?? payload?.error ?? "API_ERROR";
    throw new Error(toUserMessage(errorCode));
  }

  return payload;
}

function toUserMessage(errorCode) {
  const messages = {
    INVALID_PHASE: "지금은 수행할 수 없는 행동입니다.",
    INVALID_ARTIST: "선택할 수 없는 아티스트입니다.",
    NOT_ENOUGH_GOLD: "골드가 부족합니다.",
    BOARD_FULL: "현재 레벨의 보드 제한을 초과했습니다.",
    TRACK_NOT_IN_SHOP: "상점에 없는 트랙입니다.",
    UNIT_NOT_FOUND: "선택한 기물을 찾을 수 없습니다.",
    MAX_LEVEL_REACHED: "이미 최대 레벨입니다.",
    EMPTY_BOARD: "전투에 참여할 곡을 먼저 구매하세요.",
    SESSION_NOT_FOUND: "게임 세션을 찾을 수 없습니다."
  };

  return messages[errorCode] ?? `요청 처리 중 오류가 발생했습니다. (${errorCode})`;
}

async function boot() {
  try {
    const data = await api("/game/new", { method: "POST" });
    state.sessionId = data.session_id;
    state.candidates = data.candidates;
    state.phase = "start";
    render();
  } catch (error) {
    renderError(error);
  }
}

async function selectPersona(artistId) {
  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/persona`, {
      method: "POST",
      body: JSON.stringify({ artist_id: artistId })
    });
    updateGame(game);
  });
}

async function buyTrack(trackId) {
  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/buy`, {
      method: "POST",
      body: JSON.stringify({ track_id: trackId })
    });
    updateGame(game);
    const track = game.board.at(-1);
    showToast(`${track?.track_name ?? "트랙"}을(를) 보드에 배치했습니다.`);
  });
}

async function sellSelectedUnit() {
  if (!state.selectedUnitId) {
    showToast("판매할 기물을 선택하세요.");
    return;
  }

  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/sell`, {
      method: "POST",
      body: JSON.stringify({ unit_id: state.selectedUnitId })
    });
    state.selectedUnitId = null;
    updateGame(game);
    showToast(`${GAME_CONFIG.sellRefund} Gold를 돌려받았습니다.`);
  });
}

async function rerollShop() {
  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/reroll`, { method: "POST" });
    updateGame(game);
  });
}

async function buyExp() {
  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/buy_exp`, { method: "POST" });
    updateGame(game);
  });
}

async function startCombat() {
  if (!state.game?.board?.length) {
    showToast("전투에 참여할 곡을 먼저 구매하세요.");
    return;
  }

  state.phase = "combat";
  state.combatLogs = ["스테이지 조명이 어두워지고, 상대 아티스트의 트랙이 입장합니다."];
  state.combatDone = false;
  render();

  try {
    const game = await api(`/game/${state.sessionId}/start_combat`, { method: "POST" });
    await playCombatLogs(game.last_battle_log ?? []);
    state.combatDone = true;
    render();
    await sleep(combatDelay(1100));
    updateGame(game);
  } catch (error) {
    state.phase = "shop";
    state.combatLogs = [];
    state.combatDone = false;
    showToast(error.message);
  }
}

async function playCombatLogs(logs) {
  const dramaticLogs = logs.length > 0 ? logs : ["전투 로그가 비어 있습니다."];
  await sleep(combatDelay(800));

  for (const log of dramaticLogs) {
    state.combatLogs = [...state.combatLogs, log].slice(-9);
    render();
    await sleep(log.includes("승리") || log.includes("패배") ? combatDelay(1300) : combatDelay(850));
  }
}

async function nextRound() {
  await perform(async () => {
    const game = await api(`/game/${state.sessionId}/next_round`, { method: "POST" });
    state.selectedUnitId = null;
    updateGame(game);
  });
}

async function restartGame() {
  state.sessionId = null;
  state.candidates = [];
  state.game = null;
  state.selectedUnitId = null;
  state.phase = "loading";
  state.combatLogs = [];
  state.combatDone = false;
  await boot();
}

async function perform(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message);
  }
}

function updateGame(game) {
  state.game = game;
  state.phase = normalizePhase(game.phase);
  state.combatLogs = [];
  state.combatDone = false;
  render();
}

function getSelectedUnit() {
  return state.game?.board?.find((unit) => unit.unit_id === state.selectedUnitId) ?? null;
}

function imageTag(src, alt, className) {
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
            백엔드 세션이 생성되었습니다. 페르소나 아티스트를 선택하면 이후 상점과 전투는 FastAPI 서버 상태를 기준으로 진행됩니다.
          </p>
        </div>
        <div class="artist-grid">
          ${state.candidates.map(renderArtistCard).join("")}
        </div>
      </div>
      ${renderToast()}
    </section>
  `;

  document.querySelectorAll("[data-artist-id]").forEach((button) => {
    button.addEventListener("click", () => selectPersona(button.dataset.artistId));
  });
}

function renderArtistCard(artist) {
  const sample = artist.sample_popularity?.join(", ") ?? "-";
  const name = displayArtistName(artist);

  return `
    <button class="artist-card" data-artist-id="${escapeHtml(artist.artist_id)}">
      ${imageTag(artistImage(artist), `${name} artist image`, "artist-image")}
      <span class="pill strong">페르소나 선택</span>
      <div>
        <h2>${escapeHtml(name)}</h2>
        <div class="artist-meta">
          <span>${escapeHtml(artist.genre ?? artist.artist_name)}</span>
          <span>Avg POP ${escapeHtml(artist.avg_popularity)}</span>
        </div>
        <p class="card-subtitle">Sample POP ${escapeHtml(sample)}</p>
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
          <div class="panel board-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Board</p>
                <h2>앨범 커버 기물</h2>
                <p class="muted">현재 레벨 ${state.game.level}: 최대 ${state.game.max_board_size}개 배치 가능</p>
              </div>
              <span class="pill">${state.game.board.length}/${state.game.max_board_size} deployed</span>
            </div>
            <div class="board">${renderBoardSlots()}</div>
          </div>
          <section class="panel shop-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Shop</p>
                <h2>이번 라운드 트랙</h2>
              </div>
              <span class="pill">3 Gold</span>
            </div>
            <div class="shop-grid">${state.game.shop.map(renderTrackCard).join("")}</div>
          </section>
        </section>
        <aside class="side-stack">
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
              ${renderBattleSpeedControl("battleSpeed")}
            </div>
          </section>
          <section class="panel">${renderUnitDetail(selectedUnit)}</section>
        </aside>
      </div>
      ${renderToast()}
    </main>
  `;

  bindGameEvents();
}

function renderHud() {
  const artistName = displayArtistName(state.game);

  return `
    <header class="hud">
      <div class="hud-card artist-chip">
        ${imageTag(artistImage(state.game), artistName, "artist-chip-image")}
        <div>
          <span>Persona</span>
          <strong>${escapeHtml(artistName)}</strong>
        </div>
      </div>
      <div class="hud-card"><span>Round</span><strong>${state.game.round}/${GAME_CONFIG.maxRound}</strong></div>
      <div class="hud-card"><span>Heart</span><strong>${"♥".repeat(state.game.hearts)}</strong></div>
      <div class="hud-card"><span>Gold</span><strong>${state.game.gold}</strong></div>
      <div class="hud-card"><span>Level</span><strong>Lv. ${state.game.level}</strong></div>
      <div class="hud-card"><span>EXP</span><strong>${state.game.exp}${state.game.next_level_exp ? ` / ${state.game.next_level_exp}` : ""}</strong></div>
    </header>
  `;
}

function renderBoardSlots() {
  const slots = [];

  for (let index = 0; index < GAME_CONFIG.maxLevel; index += 1) {
    const unit = state.game.board[index];
    const isLocked = index >= state.game.max_board_size;

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
  const isSelected = unit.unit_id === state.selectedUnitId;
  const powerfulClass = unit.popularity <= 20 ? "powerful" : "";
  const name = displayTrackName(unit);

  return `
    <button class="unit-card ${isSelected ? "selected" : ""} ${powerfulClass}" data-unit-id="${escapeHtml(unit.unit_id)}">
      ${imageTag(trackImage(unit), `${name} album cover`, "unit-cover")}
      <div>
        <p class="card-title">${escapeHtml(name)}</p>
        <p class="card-subtitle">${escapeHtml(unit.track_name)}</p>
        <div class="stat-row">
          <span class="pill">POP ${unit.popularity}</span>
          <span class="pill">HP ${Math.max(0, Math.ceil(unit.hp))}/${unit.max_hp}</span>
          <span class="pill strong">ATK ${formatAtk(unit.atk)}</span>
        </div>
      </div>
    </button>
  `;
}

function renderTrackCard(track) {
  const canBuy = state.game.gold >= GAME_CONFIG.unitCost && state.game.board.length < state.game.max_board_size;
  const name = displayTrackName(track);

  return `
    <button class="track-card" data-track-id="${escapeHtml(track.track_id)}" ${canBuy ? "" : "disabled"}>
      ${imageTag(trackImage(track), `${name} album cover`, "cover")}
      <div>
        <p class="card-title">${escapeHtml(name)}</p>
        <p class="card-subtitle">${escapeHtml(track.track_name)}</p>
        <div class="stat-row">
          <span class="pill">POP ${track.popularity}</span>
          <span class="pill strong">ATK ${formatAtk(track.atk)}</span>
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
      <p class="muted">보드 위 앨범 커버를 클릭하면 백엔드가 계산한 인기도와 공격력을 확인할 수 있습니다.</p>
    `;
  }

  const name = displayTrackName(unit);

  return `
    <p class="eyebrow">Unit Detail</p>
    ${imageTag(trackImage(unit), `${name} album cover`, "detail-cover")}
    <h3>${escapeHtml(name)}</h3>
    <p class="muted">${escapeHtml(unit.track_name)} · Unit ID ${escapeHtml(unit.unit_id)}</p>
    <div class="stat-row">
      <span class="pill">HP ${Math.max(0, Math.ceil(unit.hp))}/${unit.max_hp}</span>
      <span class="pill">Popularity ${unit.popularity}</span>
      <span class="pill strong">ATK ${formatAtk(unit.atk)}</span>
    </div>
    <p class="muted" style="margin-top: 14px;">
      ${unit.popularity <= 20 ? "무명 곡의 반격이 강력합니다." : "유명한 곡일수록 이 게임에서는 힘이 줄어듭니다."}
    </p>
  `;
}

function renderBattleLog() {
  const logs = state.game?.last_battle_log ?? [
    "아직 전투 기록이 없습니다.",
    "전투 계산과 승패 판정은 FastAPI 백엔드에서 처리됩니다."
  ];

  return `
    <ul class="log-list">
      ${logs.slice(-8).map((log) => `<li>${renderHighlightedLog(log)}</li>`).join("")}
    </ul>
  `;
}

function renderCombatOverlay() {
  app.innerHTML = `
    <main class="game-screen">
      ${renderHud()}
      <div class="overlay">
        <div class="result-card combat-card">
          <p class="eyebrow">Combat</p>
          <h2>${state.combatDone ? "전투 종료" : "라이브 배틀 진행 중"}</h2>
          <p class="muted">
            ${state.combatDone ? "결과를 정산하는 중입니다." : "상대 아티스트의 곡과 턴마다 공격을 주고받습니다."}
          </p>
          ${renderBattleSpeedControl("combatSpeed")}
          <div class="combat-pulse" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <ul class="log-list combat-log" aria-live="polite">
            ${state.combatLogs.map((log) => `<li>${renderHighlightedLog(log)}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${renderToast()}
    </main>
  `;

  bindBattleSpeedControl("#combatSpeed");
}

function renderResolution() {
  const won = state.game.last_result === "win";

  app.innerHTML = `
    <main class="game-screen">
      ${renderHud()}
      <div class="overlay">
        <div class="result-card">
          <p class="eyebrow">Resolution</p>
          <h2>${won ? "승리했습니다" : "패배했습니다"}</h2>
          <p class="muted">
            ${won ? "승리 보너스 1 Gold를 획득했습니다." : "하트 1개를 잃었습니다. 더 강한 무명곡을 찾아보세요."}
          </p>
          ${renderBattleLog()}
          <button class="button" id="nextRound" style="margin-top: 18px;">다음 라운드</button>
        </div>
      </div>
      ${renderToast()}
    </main>
  `;

  document.querySelector("#nextRound").addEventListener("click", nextRound);
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
              ? "10라운드를 클리어했습니다. 백엔드 서버가 모든 전투 결과를 확정했습니다."
              : "하트가 모두 사라졌습니다. 다음 시도에서는 더 낮은 인기도의 트랙을 찾아보세요."
          }
        </p>
        ${state.game?.last_battle_log ? renderBattleLog() : ""}
        <button class="button" id="restartGame" style="margin-top: 24px;">새 게임 시작</button>
      </div>
      ${renderToast()}
    </section>
  `;

  document.querySelector("#restartGame").addEventListener("click", restartGame);
}

function bindGameEvents() {
  document.querySelectorAll("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => buyTrack(button.dataset.trackId));
  });

  document.querySelectorAll("[data-unit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedUnitId = button.dataset.unitId;
      render();
    });
  });

  document.querySelector("#startBattle").addEventListener("click", startCombat);
  document.querySelector("#rerollShop").addEventListener("click", rerollShop);
  document.querySelector("#buyExp").addEventListener("click", buyExp);
  document.querySelector("#sellUnit").addEventListener("click", sellSelectedUnit);
  bindBattleSpeedControl("#battleSpeed");
}

function renderBattleSpeedControl(id) {
  return `
    <label class="speed-control" for="${id}">
      <span>전투 속도 <strong data-speed-label>${battleSpeedLabel()} · ${state.battleSpeed.toFixed(2)}x</strong></span>
      <input
        id="${id}"
        type="range"
        min="0.5"
        max="2"
        step="0.25"
        value="${state.battleSpeed}"
        aria-label="전투 로그 출력 속도"
      />
    </label>
  `;
}

function bindBattleSpeedControl(selector) {
  const input = document.querySelector(selector);

  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    state.battleSpeed = Number(input.value);
    document.querySelectorAll("[data-speed-label]").forEach((label) => {
      label.textContent = `${battleSpeedLabel()} · ${state.battleSpeed.toFixed(2)}x`;
    });
  });
}

function renderToast() {
  return state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : "";
}

function renderError(error) {
  app.innerHTML = `
    <section class="loading-screen">
      <div class="end-card">
        <p class="eyebrow">Error</p>
        <h2>프로그램을 시작하지 못했습니다.</h2>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button" id="retryBoot" style="margin-top: 20px;">다시 시도</button>
      </div>
    </section>
  `;

  document.querySelector("#retryBoot").addEventListener("click", restartGame);
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

boot();
