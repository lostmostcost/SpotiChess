// Spotify Chess — 단일 페이지 클라이언트.
// 백엔드 schema는 backend/app/schemas.py 가 정본 (CLAUDE.md §4.1).

const API = ""; // 동일 origin (FastAPI 정적 mount).

const state = {
  shop: [],
  teamA: [],
  teamB: [],
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== undefined && v !== null) {
      node.setAttribute(k, v);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function fmt(n) {
  return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function genreColor(tag) {
  return (
    {
      "K-Pop": "bg-pink-500/20 text-pink-300",
      "Hip-Hop": "bg-amber-500/20 text-amber-300",
      Rock: "bg-red-500/20 text-red-300",
      Indie: "bg-emerald-500/20 text-emerald-300",
      EDM: "bg-cyan-500/20 text-cyan-300",
      Trot: "bg-violet-500/20 text-violet-300",
    }[tag] || "bg-zinc-500/20 text-zinc-300"
  );
}

function powerColor(power) {
  if (power >= 80) return "text-spotify-green";
  if (power >= 50) return "text-spotify-amber";
  return "text-spotify-pink";
}

// SynergyBuffs(Optional[str]…)에서 활성 버프만 한 줄로 요약.
function buffSummary(buffs) {
  if (!buffs) return "";
  const labels = {
    attack_speed_bonus: "AS",
    attack_bonus: "ATK",
    hp_bonus: "HP",
    lifesteal_meta: "LS",
    stun_chance_meta: "Stun",
    gold_if_win_meta: "Gold",
  };
  return Object.entries(buffs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${labels[k] || k} ${v}`)
    .join(" · ");
}

// ---------- API calls ----------
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}

// ---------- Card rendering ----------
function unitCard(unit, opts = {}) {
  const actions = opts.compact
    ? null
    : el(
        "div",
        { class: "flex gap-2 mt-3" },
        el(
          "button",
          {
            class:
              "flex-1 bg-spotify-green/90 text-black text-xs font-semibold rounded-full py-1 hover:bg-spotify-green",
            onClick: () => addToTeam("A", unit),
          },
          "→ A",
        ),
        el(
          "button",
          {
            class:
              "flex-1 bg-spotify-pink/90 text-black text-xs font-semibold rounded-full py-1 hover:bg-spotify-pink",
            onClick: () => addToTeam("B", unit),
          },
          "→ B",
        ),
      );

  const buffs = buffSummary(unit.synergy_buffs);

  return el(
    "div",
    {
      class:
        "border border-spotify-border bg-spotify-card hover:bg-spotify-cardHover rounded-lg p-3 transition",
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-2 mb-2" },
      el(
        "div",
        { class: "min-w-0" },
        el("div", { class: "font-semibold truncate" }, unit.track_name),
        el("div", { class: "text-xs text-spotify-muted truncate" }, unit.artist_name),
      ),
      el(
        "span",
        {
          class:
            "shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-black/40 border border-spotify-border",
        },
        `${unit.cost}★`,
      ),
    ),
    el(
      "div",
      { class: "flex flex-wrap gap-1 mb-2" },
      unit.synergy_tag
        ? el(
            "span",
            { class: `text-[10px] px-2 py-0.5 rounded ${genreColor(unit.synergy_tag)}` },
            unit.synergy_tag,
          )
        : null,
      unit.explicit_proc_chance > 0
        ? el(
            "span",
            { class: "text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300" },
            `🅴 ${unit.explicit_proc_chance}%`,
          )
        : null,
      unit.star_level > 1
        ? el(
            "span",
            {
              class:
                "text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300",
            },
            `${"★".repeat(unit.star_level)}`,
          )
        : null,
    ),
    el(
      "div",
      { class: "grid grid-cols-4 gap-2 text-center text-xs" },
      el(
        "div",
        null,
        el("div", { class: "text-spotify-muted text-[10px]" }, "POWER"),
        el(
          "div",
          { class: `font-bold text-base ${powerColor(unit.power)}` },
          fmt(unit.power),
        ),
      ),
      el(
        "div",
        null,
        el("div", { class: "text-spotify-muted text-[10px]" }, "HP"),
        el("div", { class: "font-semibold" }, fmt(unit.hp)),
      ),
      el(
        "div",
        null,
        el("div", { class: "text-spotify-muted text-[10px]" }, "ATK"),
        el("div", { class: "font-semibold" }, fmt(unit.attack)),
      ),
      el(
        "div",
        null,
        el("div", { class: "text-spotify-muted text-[10px]" }, "AS"),
        el("div", { class: "font-semibold" }, fmt(unit.attack_speed)),
      ),
    ),
    buffs
      ? el(
          "div",
          { class: "text-[10px] text-spotify-muted mt-2 truncate" },
          buffs,
        )
      : null,
    actions,
  );
}

function teamRow(side, unit, idx) {
  return el(
    "div",
    {
      class:
        "flex items-center justify-between gap-2 bg-black/30 border border-spotify-border rounded-md px-3 py-2",
    },
    el(
      "div",
      { class: "min-w-0" },
      el("div", { class: "text-sm font-medium truncate" }, unit.track_name),
      el(
        "div",
        { class: "text-[10px] text-spotify-muted truncate" },
        unit.artist_name,
      ),
    ),
    el(
      "div",
      { class: "flex items-center gap-2 shrink-0" },
      el(
        "span",
        { class: `text-sm font-bold ${powerColor(unit.power)}` },
        fmt(unit.power),
      ),
      el(
        "button",
        {
          class: "text-spotify-muted hover:text-spotify-pink text-xs px-1",
          onClick: () => removeFromTeam(side, idx),
        },
        "✕",
      ),
    ),
  );
}

// ---------- Renders ----------
function renderShop() {
  const grid = $("shop-grid");
  grid.innerHTML = "";
  if (state.shop.length === 0) {
    grid.append(
      el(
        "div",
        { class: "col-span-full text-center text-spotify-muted py-12" },
        "Roll 버튼을 눌러 상점을 굴려보세요.",
      ),
    );
    return;
  }
  state.shop.forEach((unit) => grid.append(unitCard(unit)));
}

function renderTeam(side) {
  const list = state[side === "A" ? "teamA" : "teamB"];
  const node = $(side === "A" ? "team-a" : "team-b");
  const score = list.reduce((s, u) => s + u.power, 0);
  $(side === "A" ? "team-a-score" : "team-b-score").textContent = fmt(score);
  node.innerHTML = "";
  if (list.length === 0) {
    node.append(el("div", { class: "text-xs text-spotify-muted" }, "비어 있음"));
  } else {
    list.forEach((u, i) => node.append(teamRow(side, u, i)));
  }
  $("simulate-btn").disabled =
    state.teamA.length === 0 || state.teamB.length === 0;
}

function renderBattle(result) {
  const box = $("battle-result");
  box.classList.remove("hidden");
  box.innerHTML = "";
  const winnerColor =
    result.winner === "team_a"
      ? "text-spotify-green"
      : result.winner === "team_b"
        ? "text-spotify-pink"
        : "text-spotify-amber";
  const winnerLabel =
    {
      team_a: "Team A 승리 🏆",
      team_b: "Team B 승리 🏆",
      draw: "무승부",
    }[result.winner] || result.winner;
  box.append(
    el(
      "div",
      { class: `text-lg font-bold mb-2 ${winnerColor}` },
      `${winnerLabel} (격차 ${fmt(result.score_gap)})`,
    ),
    el(
      "div",
      { class: "grid grid-cols-2 gap-3 text-xs mb-3" },
      el(
        "div",
        { class: "bg-black/30 rounded p-2" },
        el("div", { class: "text-spotify-muted" }, "Team A 총 파워"),
        el("div", { class: "font-bold" }, fmt(result.team_a_power)),
      ),
      el(
        "div",
        { class: "bg-black/30 rounded p-2" },
        el("div", { class: "text-spotify-muted" }, "Team B 총 파워"),
        el("div", { class: "font-bold" }, fmt(result.team_b_power)),
      ),
    ),
    el(
      "ul",
      { class: "text-xs space-y-1 text-spotify-muted" },
      ...result.logs.map((l) => el("li", null, `· ${l}`)),
    ),
  );
}

// ---------- Actions ----------
async function rollShop() {
  const count = parseInt($("shop-count").value, 10) || 5;
  const btn = $("roll-btn");
  btn.disabled = true;
  btn.textContent = "Rolling…";
  try {
    // /shop/roll 응답은 list[UnitStats] 그 자체 (CLAUDE.md §4.1).
    const data = await api(`/shop/roll?count=${count}`);
    state.shop = data;
    renderShop();
  } catch (err) {
    alert(`상점 롤 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Roll";
  }
}

function addToTeam(side, unit) {
  const list = side === "A" ? state.teamA : state.teamB;
  list.push(unit);
  renderTeam(side);
}

function removeFromTeam(side, idx) {
  const list = side === "A" ? state.teamA : state.teamB;
  list.splice(idx, 1);
  renderTeam(side);
}

async function simulate() {
  const btn = $("simulate-btn");
  btn.disabled = true;
  btn.textContent = "Simulating…";
  try {
    const result = await api("/battle/simulate", {
      method: "POST",
      body: { team_a: state.teamA, team_b: state.teamB },
    });
    renderBattle(result);
  } catch (err) {
    alert(`전투 실패: ${err.message}`);
  } finally {
    btn.textContent = "Simulate";
    btn.disabled = state.teamA.length === 0 || state.teamB.length === 0;
  }
}

// 메타 페널티 데모: 동일 트랙에 pick 5/30/60%을 넣어 power 변화를 보여준다.
async function metaDemo() {
  const baseTrack = {
    track_id: "demo_bts",
    track_name: "Dynamite",
    artist_name: "BTS",
    duration_ms: 199093,
    popularity: 98,
    explicit: false,
    genres: ["k-pop"],
    followers: 47000000,
    total_streams: 1800000000,
    star_level: 1,
  };
  const rates = [5, 30, 60];
  const btn = $("meta-demo-btn");
  btn.disabled = true;
  btn.textContent = "Computing…";
  try {
    const results = await Promise.all(
      rates.map((rate) =>
        api("/units/compute", {
          method: "POST",
          body: { ...baseTrack, selection_rate_percent: rate },
        }),
      ),
    );
    const grid = $("meta-result");
    grid.innerHTML = "";
    results.forEach((unit, i) => {
      grid.append(
        el(
          "div",
          {
            class: `border rounded-lg p-4 ${
              i === 0
                ? "border-spotify-green bg-spotify-greenSoft pulse-green"
                : "border-spotify-border bg-black/30"
            }`,
          },
          el(
            "div",
            { class: "text-xs text-spotify-muted mb-1" },
            `pick rate = ${rates[i]}%`,
          ),
          el(
            "div",
            { class: `text-3xl font-black ${powerColor(unit.power)}` },
            fmt(unit.power),
          ),
          el("div", { class: "text-[10px] text-spotify-muted mt-1" }, "power"),
        ),
      );
    });
  } catch (err) {
    alert(`메타 데모 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "BTS로 데모 실행";
  }
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  $("roll-btn").addEventListener("click", rollShop);
  $("simulate-btn").addEventListener("click", simulate);
  $("meta-demo-btn").addEventListener("click", metaDemo);
  rollShop();
});
