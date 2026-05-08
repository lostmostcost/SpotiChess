const app = document.querySelector("#app");
const combatOverlayRoot = document.createElement("div");
combatOverlayRoot.id = "combatOverlayRoot";
document.body.appendChild(combatOverlayRoot);
const musicPortalRoot = document.createElement("div");
musicPortalRoot.id = "musicPortalRoot";
document.body.appendChild(musicPortalRoot);

const state = {
  sessionId: null,
  candidates: [],
  game: null,
  selectedUnitId: null,
  phase: "loading",
  combatLogs: [],
  combatDone: false,
  combatMatchup: null,
  combatAllyUnits: [],
  combatEnemyUnits: [],
  battleSpeed: 1,
  music: {
    playlist: [],
    currentIndex: 0,
    isPlaying: false,
    loading: false,
    error: "",
    currentTime: 0,
    duration: 0,
    volume: 0.7,
    configured: true
  },
  toast: ""
};

const bgmAudio = new Audio();
bgmAudio.volume = state.music.volume;
let renderedMusicKey = "";

const GAME_CONFIG = {
  unitCost: 3,
  sellRefund: 3,
  rerollCost: 1,
  buyExpCost: 4,
  maxLevel: 3,
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

function setAppHtml(html) {
  app.innerHTML = html;
  mountMusicPortal();
}

function mountMusicPortal() {
  const host = document.querySelector("#musicPortalHost");
  musicPortalRoot.hidden = false;

  if (host) {
    musicPortalRoot.classList.add("music-docked");
    musicPortalRoot.classList.remove("music-parked");
    musicPortalRoot.classList.remove("music-background");
    renderMusicPortal();
    syncMusicPortalPosition();
  } else if (musicPortalRoot.innerHTML && state.music.playlist.length > 0) {
    musicPortalRoot.classList.add("music-docked");
    musicPortalRoot.classList.add("music-background");
    musicPortalRoot.classList.remove("music-parked");
  } else {
    musicPortalRoot.classList.remove("music-docked");
    musicPortalRoot.classList.remove("music-background");
    musicPortalRoot.classList.add("music-parked");
  }
}

function syncMusicPortalPosition() {
  const host = document.querySelector("#musicPortalHost");
  if (!host || musicPortalRoot.classList.contains("music-parked")) {
    return;
  }

  const applyRect = () => {
    const rect = host.getBoundingClientRect();
    const panelRect = host.closest(".music-panel")?.getBoundingClientRect();
    const sourceRect = rect.width > 0 && rect.height > 0 ? rect : panelRect;

    if (!sourceRect) {
      return;
    }

    const width = Math.max(260, sourceRect.width);
    const height = Math.max(240, sourceRect.height);

    musicPortalRoot.style.left = `${sourceRect.left}px`;
    musicPortalRoot.style.top = `${sourceRect.top}px`;
    musicPortalRoot.style.width = `${width}px`;
    musicPortalRoot.style.height = `${height}px`;
  };

  applyRect();

  window.requestAnimationFrame(() => {
    const latestHost = document.querySelector("#musicPortalHost");
    if (!latestHost || musicPortalRoot.classList.contains("music-parked")) {
      return;
    }
    applyRect();
  });
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
    await loadPersonaMusic();
  });
}

async function loadPersonaMusic() {
  state.music.loading = true;
  state.music.error = "";
  render();

  try {
    const data = await api(`/game/${state.sessionId}/persona-playlist`);
    const playableTracks = (data.tracks ?? []).filter((track) => track.preview_url || spotifyEmbedUrl(track));
    state.music.playlist = playableTracks;
    state.music.currentIndex = 0;
    state.music.configured = data.configured !== false;
    state.music.loading = false;

    if (!state.music.configured) {
      state.music.error = "Spotify API 키를 확인하세요.";
    } else if (playableTracks.length === 0) {
      state.music.error = "Spotify에서 미리듣기 가능한 트랙을 찾지 못했습니다.";
    } else {
      loadCurrentMusicTrack();
      await playMusic();
    }
  } catch (error) {
    state.music.loading = false;
    state.music.error = error.message || "배경음악을 불러오지 못했습니다.";
  }

  render();
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

  state.combatLogs = [];
  state.combatDone = false;
  state.combatAllyUnits = state.game.board.map((u) => ({ ...u }));
  state.combatEnemyUnits = [];
  renderCombatOverlay();

  try {
    const game = await api(`/game/${state.sessionId}/start_combat`, { method: "POST" });
    state.combatMatchup = { player: state.game, enemy: game.last_enemy_artist };
    state.combatEnemyUnits = (game.last_enemy_units_initial ?? []).map((u) => ({ ...u }));
    renderCombatOverlay();

    await playCombatEvents(game.last_battle_events ?? [], state.combatAllyUnits, state.combatEnemyUnits);

    state.combatDone = true;
    renderCombatOverlay();
    await sleep(combatDelay(900));
    clearCombatOverlay();
    updateGame(game);
  } catch (error) {
    state.phase = "shop";
    state.combatLogs = [];
    state.combatDone = false;
    state.combatMatchup = null;
    state.combatAllyUnits = [];
    state.combatEnemyUnits = [];
    clearCombatOverlay();
    showToast(error.message);
  }
}

async function playCombatEvents(events, allyUnits, enemyUnits) {
  const hpMap = {};
  [...allyUnits, ...enemyUnits].forEach((u) => {
    hpMap[u.unit_id] = { hp: u.hp, maxHp: u.max_hp };
  });

  await sleep(combatDelay(600));

  for (const ev of events) {
    if (ev.type !== "attack") continue;

    const atkEl = document.querySelector(`[data-combat-unit="${ev.attacker_id}"]`);
    const tgtEl = document.querySelector(`[data-combat-unit="${ev.target_id}"]`);
    if (!atkEl || !tgtEl) {
      await sleep(combatDelay(120));
      continue;
    }

    const atkRect = atkEl.getBoundingClientRect();
    const tgtRect = tgtEl.getBoundingClientRect();
    const dx = ((tgtRect.left + tgtRect.width / 2) - (atkRect.left + atkRect.width / 2)) * 0.7;
    const dy = ((tgtRect.top + tgtRect.height / 2) - (atkRect.top + atkRect.height / 2)) * 0.7;

    // 1) 공격자 돌진 (앞으로 뒤로)
    atkEl.classList.add("is-attacker");
    const dashAnim = atkEl.animate(
      [
        { transform: "translate(0,0) scale(1)", filter: "brightness(1)", offset: 0 },
        { transform: `translate(${dx * 0.2}px, ${dy * 0.2}px) scale(1.05)`, filter: "brightness(1.2)", offset: 0.2 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.18)`, filter: "brightness(1.7)", offset: 0.5 },
        { transform: `translate(${dx * 0.2}px, ${dy * 0.2}px) scale(1.05)`, filter: "brightness(1.1)", offset: 0.75 },
        { transform: "translate(0,0) scale(1)", filter: "brightness(1)", offset: 1 }
      ],
      { duration: combatDelay(560), easing: "cubic-bezier(.4,1.6,.5,1)" }
    );

    // 2) 충돌 시점에 타겟 흔들림 + 데미지 숫자 + HP 갱신
    await sleep(combatDelay(260));

    tgtEl.animate(
      [
        { transform: "translate(0,0) rotate(0)" },
        { transform: "translate(-9px,3px) rotate(-3deg)" },
        { transform: "translate(8px,-4px) rotate(3deg)" },
        { transform: "translate(-5px,5px) rotate(-2deg)" },
        { transform: "translate(4px,-2px) rotate(1deg)" },
        { transform: "translate(0,0) rotate(0)" }
      ],
      { duration: combatDelay(420), easing: "ease-out" }
    );

    tgtEl.classList.add("is-impacted");
    setTimeout(() => tgtEl.classList.remove("is-impacted"), combatDelay(420));

    floatDamage(tgtEl, ev.dmg);
    spawnImpactBurst(tgtEl);

    hpMap[ev.target_id].hp = ev.target_hp_after;
    updateHpBar(tgtEl, hpMap[ev.target_id].hp, hpMap[ev.target_id].maxHp);

    await dashAnim.finished;
    atkEl.classList.remove("is-attacker");

    if (ev.target_hp_after <= 0 && !tgtEl.classList.contains("dying")) {
      tgtEl.classList.add("dying");
      await sleep(combatDelay(280));
    } else {
      await sleep(combatDelay(120));
    }
  }
}

function floatDamage(el, dmg) {
  const node = document.createElement("div");
  node.className = "damage-float";
  node.textContent = `-${dmg}`;
  el.appendChild(node);
  node.addEventListener("animationend", () => node.remove(), { once: true });
}

function spawnImpactBurst(el) {
  const burst = document.createElement("div");
  burst.className = "impact-burst";
  el.appendChild(burst);
  burst.addEventListener("animationend", () => burst.remove(), { once: true });
}

function updateHpBar(el, hp, maxHp) {
  const fill = el.querySelector(".hp-fill");
  const text = el.querySelector(".hp-text");
  if (!fill) return;
  const safeHp = Math.max(0, hp);
  const pct = Math.max(0, Math.min(100, (safeHp / maxHp) * 100));
  fill.style.width = `${pct}%`;
  if (pct <= 25) fill.style.backgroundColor = "#ff4d4f";
  else if (pct <= 50) fill.style.backgroundColor = "#ff8c00";
  else fill.style.backgroundColor = "";
  if (text) text.textContent = `${Math.ceil(safeHp)}/${maxHp}`;
}

function getCurrentMusicTrack() {
  return state.music.playlist[state.music.currentIndex] ?? null;
}

function spotifyEmbedUrl(track) {
  const uriId = track?.uri?.startsWith("spotify:track:") ? track.uri.split(":").at(-1) : null;
  const urlId = track?.external_url?.match(/\/track\/([^?]+)/)?.[1] ?? null;
  const id = uriId || urlId;
  return id ? `https://open.spotify.com/embed/track/${encodeURIComponent(id)}?utm_source=generator&theme=0` : "";
}

function loadCurrentMusicTrack() {
  const track = getCurrentMusicTrack();
  if (!track?.preview_url) {
    return;
  }

  if (bgmAudio.src !== track.preview_url) {
    bgmAudio.src = track.preview_url;
    bgmAudio.currentTime = 0;
  }
}

async function playMusic() {
  const track = getCurrentMusicTrack();
  if (!track?.preview_url) {
    state.music.error = spotifyEmbedUrl(track)
      ? "이 곡은 Spotify 내장 플레이어에서 재생 버튼을 눌러 미리듣기하세요."
      : "재생 가능한 트랙이 없습니다.";
    render();
    return;
  }

  loadCurrentMusicTrack();
  try {
    await bgmAudio.play();
    state.music.isPlaying = true;
    state.music.error = "";
  } catch (_) {
    state.music.isPlaying = false;
    state.music.error = "브라우저가 자동 재생을 막았습니다. 재생 버튼을 눌러주세요.";
  }
  render();
}

function pauseMusic() {
  bgmAudio.pause();
  state.music.isPlaying = false;
  render();
}

function toggleMusic() {
  if (state.music.isPlaying) {
    pauseMusic();
  } else {
    playMusic();
  }
}

function changeMusicTrack(delta) {
  if (state.music.playlist.length === 0) {
    return;
  }

  state.music.currentIndex =
    (state.music.currentIndex + delta + state.music.playlist.length) % state.music.playlist.length;
  loadCurrentMusicTrack();
  if (state.music.isPlaying) {
    playMusic();
  } else {
    state.music.error = "";
    render();
  }
}

function seekMusic(percent) {
  if (!Number.isFinite(bgmAudio.duration) || bgmAudio.duration <= 0) {
    return;
  }
  bgmAudio.currentTime = (percent / 100) * bgmAudio.duration;
}

function setMusicVolume(value) {
  state.music.volume = Math.max(0, Math.min(1, Number(value) / 100));
  bgmAudio.volume = state.music.volume;
  render();
}

function resetMusic() {
  bgmAudio.pause();
  bgmAudio.removeAttribute("src");
  renderedMusicKey = "";
  musicPortalRoot.innerHTML = "";
  state.music = {
    playlist: [],
    currentIndex: 0,
    isPlaying: false,
    loading: false,
    error: "",
    currentTime: 0,
    duration: 0,
    volume: state.music.volume,
    configured: true
  };
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
  state.combatMatchup = null;
  state.combatAllyUnits = [];
  state.combatEnemyUnits = [];
  resetMusic();
  clearCombatOverlay();
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
  clearCombatOverlay();
  state.game = game;
  state.phase = normalizePhase(game.phase);
  state.combatLogs = [];
  state.combatDone = false;
  state.combatMatchup = null;
  state.combatAllyUnits = [];
  state.combatEnemyUnits = [];
  render();
}

function getSelectedUnit() {
  return state.game?.board?.find((unit) => unit.unit_id === state.selectedUnitId) ?? null;
}

function imageTag(src, alt, className) {
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function renderStartScreen() {
  setAppHtml(`
    <section class="start-screen">
      <div class="start-shell">
        <div class="hero">
          <p class="eyebrow">Spotify Chess</p>
          <h1>Spotify Chess</h1>
          <p class="hero-copy">
            Popularity는 차트의 숫자일 뿐, 음악의 강함을 증명하지 않습니다.
            덜 알려진 트랙이 더 큰 힘을 발휘하는 역전의 무대에 오르세요.
          </p>
        </div>
        <div class="artist-grid">
          ${state.candidates.map(renderArtistCard).join("")}
        </div>
      </div>
      ${renderToast()}
    </section>
  `);

  document.querySelectorAll("[data-artist-id]").forEach((button) => {
    button.addEventListener("click", () => selectPersona(button.dataset.artistId));
  });
}

function renderArtistCard(artist) {
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
      </div>
    </button>
  `;
}

function renderGameScreen() {
  const selectedUnit = getSelectedUnit();

  setAppHtml(`
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
          <section class="panel music-panel">
            <div id="musicPortalHost"></div>
          </section>
        </aside>
      </div>
      ${renderToast()}
    </main>
  `);

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
      <p class="muted">보드 위 앨범 커버를 클릭하세요.</p>
    `;
  }

  const name = displayTrackName(unit);

  return `
    <p class="eyebrow">Unit Detail</p>
    ${imageTag(trackImage(unit), `${name} album cover`, "detail-cover")}
    <h3>${escapeHtml(name)}</h3>
    <p class="muted">${escapeHtml(unit.track_name)}</p>
    <div class="stat-row">
      <span class="pill">HP ${Math.max(0, Math.ceil(unit.hp))}/${unit.max_hp}</span>
      <span class="pill">Popularity ${unit.popularity}</span>
      <span class="pill strong">ATK ${formatAtk(unit.atk)}</span>
    </div>
  `;
}

function getMusicRenderKey() {
  const track = getCurrentMusicTrack();
  return [
    state.music.loading ? "loading" : "ready",
    state.music.configured ? "configured" : "not-configured",
    state.music.currentIndex,
    state.music.isPlaying ? "playing" : "paused",
    track?.preview_url ?? "",
    track?.uri ?? "",
    track?.external_url ?? "",
    state.music.error,
    state.music.volume
  ].join("|");
}

function renderMusicPortal(force = false) {
  const key = getMusicRenderKey();
  if (!force && renderedMusicKey === key && musicPortalRoot.innerHTML) {
    return;
  }
  renderedMusicKey = key;
  musicPortalRoot.innerHTML = renderMusicPlayerMarkup();
  bindMusicControls();
}

function renderMusicPlayerMarkup() {
  const track = getCurrentMusicTrack();
  const embedUrl = spotifyEmbedUrl(track);
  const usesEmbed = !track?.preview_url && embedUrl;
  const progress =
    state.music.duration > 0 ? Math.min(100, (state.music.currentTime / state.music.duration) * 100) : 0;

  if (state.music.loading) {
    return `
      <div class="music-player">
        <p class="eyebrow">Persona Radio</p>
        <h3>플레이리스트를 불러오는 중...</h3>
        <p class="muted">선택한 페르소나의 곡을 Spotify에서 찾고 있습니다.</p>
      </div>
    `;
  }

  if (!track) {
    return `
      <div class="music-player">
        <p class="eyebrow">Persona Radio</p>
        <h3>배경음악 대기 중</h3>
        <p class="muted">${escapeHtml(state.music.error || "페르소나 선택 후 음악이 준비됩니다.")}</p>
      </div>
    `;
  }

  return `
    <div class="music-player ${usesEmbed ? "embed-mode" : ""}">
      <div class="music-now">
        ${imageTag(track.image || track.cover_image, `${track.name} album cover`, "music-cover")}
        <div>
          <p class="eyebrow">Persona Radio</p>
          <h3>${escapeHtml(track.name || displayTrackName(track))}</h3>
          <p class="muted">${escapeHtml(track.artist || state.game?.artist_name || "")}</p>
        </div>
      </div>
      ${
        usesEmbed
          ? `<iframe class="spotify-embed" src="${escapeHtml(embedUrl)}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
          : `
            <div class="music-progress" data-music-seek>
              <div class="music-progress-fill" style="width: ${progress}%"></div>
            </div>
          `
      }
      ${
        usesEmbed
          ? `
            <div class="music-controls embed-controls">
              <button class="button secondary compact" id="musicPrev" type="button">이전 곡</button>
              <a class="button compact" href="${escapeHtml(track.external_url ?? "#")}" target="_blank" rel="noopener">Spotify 열기</a>
              <button class="button secondary compact" id="musicNext" type="button">다음 곡</button>
            </div>
          `
          : `
            <div class="music-controls">
              <button class="button secondary compact" id="musicPrev" type="button">이전</button>
              <button class="button compact" id="musicToggle" type="button">${state.music.isPlaying ? "일시정지" : "재생"}</button>
              <button class="button secondary compact" id="musicNext" type="button">다음</button>
            </div>
          `
      }
      ${
        usesEmbed
          ? `<p class="music-error">Spotify 플레이어 안의 재생 버튼을 눌러 미리듣기하세요.</p>`
          : `
            <label class="music-volume">
              <span>Volume</span>
              <input id="musicVolume" type="range" min="0" max="100" value="${Math.round(state.music.volume * 100)}" />
            </label>
            ${state.music.error ? `<p class="music-error">${escapeHtml(state.music.error)}</p>` : ""}
          `
      }
    </div>
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
  combatOverlayRoot.innerHTML = `
    <div class="overlay combat-overlay">
      <div class="result-card combat-card">
        <p class="eyebrow">Combat</p>
        <h2>${state.combatDone ? "전투 종료" : "라이브 배틀 진행 중"}</h2>
        <p class="muted">
          ${state.combatDone ? "결과를 정산하는 중입니다." : "상대 아티스트의 곡과 턴마다 공격을 주고받습니다."}
        </p>
        ${renderCombatMatchup()}
        ${renderCombatArena()}
        ${renderBattleSpeedControl("combatSpeed")}
      </div>
    </div>
  `;

  bindBattleSpeedControl("#combatSpeed");
}

function clearCombatOverlay() {
  combatOverlayRoot.innerHTML = "";
}

function renderCombatArena() {
  const hasUnits = state.combatAllyUnits.length || state.combatEnemyUnits.length;
  if (!hasUnits) {
    return `
      <div class="combat-arena pending">
        <div class="combat-pulse" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <p class="muted">상대 트랙이 입장하고 있습니다…</p>
      </div>
    `;
  }

  const enemyRow = state.combatEnemyUnits.length
    ? state.combatEnemyUnits.map((u) => renderCombatUnit(u, "enemy")).join("")
    : `<span class="combat-row-empty">대기 중…</span>`;

  return `
    <div class="combat-arena">
      <div class="combat-row enemy-row">${enemyRow}</div>
      <div class="arena-divider"><span>BATTLE</span></div>
      <div class="combat-row ally-row">
        ${state.combatAllyUnits.map((u) => renderCombatUnit(u, "ally")).join("")}
      </div>
    </div>
  `;
}

function renderCombatUnit(unit, side) {
  const name = displayTrackName(unit);
  const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.max_hp) * 100));
  return `
    <div class="combat-unit ${side}" data-combat-unit="${escapeHtml(unit.unit_id)}">
      <div class="combat-unit-art">
        ${imageTag(trackImage(unit), name, "combat-unit-img")}
        <span class="combat-unit-atk-badge">${formatAtk(unit.atk)}</span>
      </div>
      <div class="combat-unit-name">${escapeHtml(name)}</div>
      <div class="hp-bar">
        <div class="hp-fill" style="width:${hpPct}%"></div>
        <span class="hp-text">${Math.ceil(unit.hp)}/${unit.max_hp}</span>
      </div>
    </div>
  `;
}

function renderCombatMatchup() {
  const matchup = state.combatMatchup;

  if (!matchup?.player || !matchup?.enemy) {
    return `
      <div class="battle-matchup loading">
        <div class="matchup-card"><span class="matchup-placeholder">Player</span></div>
        <strong class="versus">VS</strong>
        <div class="matchup-card"><span class="matchup-placeholder">Enemy</span></div>
      </div>
    `;
  }

  return `
    <div class="battle-matchup">
      ${renderMatchupArtist(matchup.player, "PLAYER")}
      <strong class="versus">VS</strong>
      ${renderMatchupArtist(matchup.enemy, "RIVAL")}
    </div>
  `;
}

function renderMatchupArtist(artist, label) {
  const name = displayArtistName(artist);

  return `
    <article class="matchup-card">
      ${imageTag(artistImage(artist), `${name} profile image`, "matchup-image")}
      <div>
        <span class="matchup-label">${label}</span>
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(artist.genre ?? artist.artist_name ?? "")}</p>
      </div>
    </article>
  `;
}

function renderResolution() {
  const won = state.game.last_result === "win";

  setAppHtml(`
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
  `);

  document.querySelector("#nextRound").addEventListener("click", nextRound);
}

function renderEndScreen(kind) {
  const clear = kind === "clear";

  setAppHtml(`
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
  `);

  document.querySelector("#restartGame").addEventListener("click", restartGame);
}

function bindGameEvents() {
  document.querySelectorAll("[data-track-id]").forEach((button) => {
    button.addEventListener("click", () => buyTrack(button.dataset.trackId));
  });

  document.querySelectorAll("[data-unit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectUnit(button.dataset.unitId);
    });
  });

  document.querySelector("#startBattle").addEventListener("click", startCombat);
  document.querySelector("#rerollShop").addEventListener("click", rerollShop);
  document.querySelector("#buyExp").addEventListener("click", buyExp);
  document.querySelector("#sellUnit").addEventListener("click", sellSelectedUnit);
  bindBattleSpeedControl("#battleSpeed");
}

function bindMusicControls() {
  document.querySelector("#musicPrev")?.addEventListener("click", () => changeMusicTrack(-1));
  document.querySelector("#musicToggle")?.addEventListener("click", toggleMusic);
  document.querySelector("#musicNext")?.addEventListener("click", () => changeMusicTrack(1));
  document.querySelector("#musicVolume")?.addEventListener("input", (event) => setMusicVolume(event.target.value));
  document.querySelector("[data-music-seek]")?.addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seekMusic(((event.clientX - rect.left) / rect.width) * 100);
  });
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
  setAppHtml(`
    <section class="loading-screen">
      <div class="end-card">
        <p class="eyebrow">Error</p>
        <h2>프로그램을 시작하지 못했습니다.</h2>
        <p class="muted">${escapeHtml(error.message)}</p>
        <button class="button" id="retryBoot" style="margin-top: 20px;">다시 시도</button>
      </div>
    </section>
  `);

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

bgmAudio.addEventListener("timeupdate", () => {
  state.music.currentTime = bgmAudio.currentTime || 0;
  state.music.duration = Number.isFinite(bgmAudio.duration) ? bgmAudio.duration : 0;
  const fill = document.querySelector(".music-progress-fill");
  if (fill && state.music.duration > 0) {
    fill.style.width = `${Math.min(100, (state.music.currentTime / state.music.duration) * 100)}%`;
  }
});

bgmAudio.addEventListener("loadedmetadata", () => {
  state.music.duration = Number.isFinite(bgmAudio.duration) ? bgmAudio.duration : 0;
  render();
});

bgmAudio.addEventListener("ended", () => {
  changeMusicTrack(1);
  playMusic();
});

bgmAudio.addEventListener("pause", () => {
  state.music.isPlaying = false;
});

bgmAudio.addEventListener("play", () => {
  state.music.isPlaying = true;
});

window.addEventListener("resize", syncMusicPortalPosition);

function selectUnit(unitId) {
  state.selectedUnitId = unitId;
  render();
}

boot();
