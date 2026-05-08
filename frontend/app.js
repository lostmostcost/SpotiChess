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

function powerColor(power) {
  if (power >= 80) return "text-emerald-300";
  if (power >= 50) return "text-amber-300";
  return "text-rose-300";
}

function powerGlow(power) {
  if (power >= 80) return "rgba(110, 220, 130, 0.55)";
  if (power >= 50) return "rgba(243, 210, 122, 0.55)";
  return "rgba(220, 110, 110, 0.45)";
}

// 아티스트 이름을 두 톤의 placeholder 색으로 변환 (앨범아트 자리).
function artistColors(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return [
    `hsl(${hue}, 70%, 55%)`,
    `hsl(${(hue + 40) % 360}, 60%, 22%)`,
  ];
}

function firstGlyph(text) {
  if (!text) return "?";
  // 한글/영문 첫 1자 (서로게이트 페어 안전).
  return Array.from(text)[0].toUpperCase();
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
// 하스스톤 스타일 카드. CSS 클래스는 frontend/index.html의 <style>에 정의.
function unitCard(unit, opts = {}) {
  const buffs = buffSummary(unit.synergy_buffs);
  const [c1, c2] = artistColors(unit.artist_name);

  const inner = el(
    "div",
    { class: "hs-inner" },
    el("div", { class: "hs-mana" }, String(unit.cost)),
    unit.explicit_proc_chance > 0
      ? el("div", { class: "hs-explicit", title: `19금 디버프 ${unit.explicit_proc_chance}%` }, "E")
      : null,
    el(
      "div",
      {
        class: "hs-art",
        style: `--art-c1:${c1};--art-c2:${c2};`,
      },
      firstGlyph(unit.artist_name),
    ),
    el("div", { class: "hs-name-ribbon" }, unit.track_name),
    el(
      "div",
      { class: "hs-body" },
      el("div", { class: "hs-artist" }, unit.artist_name),
      unit.synergy_tag
        ? el("div", null, el("span", { class: "hs-tag" }, unit.synergy_tag))
        : null,
      buffs ? el("div", { class: "hs-buff" }, buffs) : null,
      el(
        "div",
        { class: "hs-buff", style: "margin-top:auto;" },
        `AS ${fmt(unit.attack_speed)}`,
      ),
    ),
    el("div", { class: "hs-attack", title: `공격력 ${fmt(unit.attack)}` }, String(Math.round(unit.attack))),
    el("div", { class: "hs-health", title: `체력 ${fmt(unit.hp)}` }, String(Math.round(unit.hp))),
    el("div", {
      class: "hs-power-glow",
      style: `--glow-color:${powerGlow(unit.power)};`,
    }),
  );

  const card = el(
    "div",
    {
      class: "hs-card",
      dataset: { tier: String(unit.cost) },
      title: `Power ${fmt(unit.power)}`,
    },
    inner,
  );

  if (opts.compact) return card;

  return el(
    "div",
    { class: "flex flex-col items-center" },
    card,
    el(
      "div",
      { class: "hs-actions" },
      el(
        "button",
        { class: "to-a", onClick: () => addToTeam("A", unit) },
        "→ A",
      ),
      el(
        "button",
        { class: "to-b", onClick: () => addToTeam("B", unit) },
        "→ B",
      ),
    ),
  );
}

function teamRow(side, unit, idx) {
  return el(
    "div",
    { class: "team-minion" },
    el(
      "div",
      { class: "min-w-0 flex-1" },
      el("div", { class: "name" }, unit.track_name),
      el("div", { class: "artist" }, unit.artist_name),
    ),
    el("div", { class: "pwr" }, fmt(unit.power)),
    el(
      "button",
      {
        class: "text-gold-dim hover:text-rose-300 text-xs px-1",
        onClick: () => removeFromTeam(side, idx),
        title: "제거",
      },
      "✕",
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
        { class: "text-gold-dim text-sm py-12" },
        "상점을 굴려보세요…",
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
    node.append(
      el(
        "div",
        { class: "text-gold-dim text-xs italic self-center" },
        side === "A" ? "→ A 로 카드를 보내세요" : "→ B 로 카드를 보내세요",
      ),
    );
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
      ? "text-emerald-300"
      : result.winner === "team_b"
        ? "text-pink-300"
        : "text-amber-300";
  const winnerLabel =
    {
      team_a: "TEAM A · 승리",
      team_b: "TEAM B · 승리",
      draw: "DRAW · 무승부",
    }[result.winner] || result.winner;
  box.append(
    el(
      "div",
      {
        class: `font-display tracking-widest text-2xl font-black mb-3 ${winnerColor}`,
      },
      `🏆 ${winnerLabel} (격차 ${fmt(result.score_gap)})`,
    ),
    el(
      "div",
      { class: "grid grid-cols-2 gap-3 text-xs mb-3" },
      el(
        "div",
        { class: "bg-wood-deep/70 border border-gold-dim/40 rounded p-3" },
        el(
          "div",
          { class: "text-gold-dim font-display tracking-widest mb-1" },
          "TEAM A POWER",
        ),
        el(
          "div",
          { class: "font-display text-2xl text-gold-bright" },
          fmt(result.team_a_power),
        ),
      ),
      el(
        "div",
        { class: "bg-wood-deep/70 border border-gold-dim/40 rounded p-3" },
        el(
          "div",
          { class: "text-gold-dim font-display tracking-widest mb-1" },
          "TEAM B POWER",
        ),
        el(
          "div",
          { class: "font-display text-2xl text-gold-bright" },
          fmt(result.team_b_power),
        ),
      ),
    ),
    el(
      "ul",
      { class: "text-xs space-y-1 text-gold-cream/80" },
      ...result.logs.map((l) => el("li", null, `· ${l}`)),
    ),
  );
}

// ---------- Actions ----------
async function rollShop() {
  const count = parseInt($("shop-count").value, 10) || 5;
  const btn = $("roll-btn");
  btn.disabled = true;
  btn.textContent = "ROLLING…";
  try {
    // /shop/roll 응답은 list[UnitStats] 그 자체 (CLAUDE.md §4.1).
    const data = await api(`/shop/roll?count=${count}`);
    state.shop = data;
    renderShop();
  } catch (err) {
    alert(`상점 롤 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "ROLL";
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
  btn.textContent = "FIGHTING…";
  try {
    const result = await api("/battle/simulate", {
      method: "POST",
      body: { team_a: state.teamA, team_b: state.teamB },
    });
    renderBattle(result);
  } catch (err) {
    alert(`전투 실패: ${err.message}`);
  } finally {
    btn.textContent = "SIMULATE";
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
  btn.textContent = "READING…";
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
      const cls = i === 0 ? "meta-stone active" : "meta-stone";
      grid.append(
        el(
          "div",
          { class: cls },
          el("div", { class: "label" }, `PICK RATE · ${rates[i]}%`),
          el(
            "div",
            { class: `value ${powerColor(unit.power)}` },
            fmt(unit.power),
          ),
          el(
            "div",
            { class: "text-[10px] text-gold-dim mt-1 font-display tracking-widest" },
            "POWER",
          ),
        ),
      );
    });
  } catch (err) {
    alert(`메타 데모 실패: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "BTS 데모 실행";
  }
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  $("roll-btn").addEventListener("click", rollShop);
  $("simulate-btn").addEventListener("click", simulate);
  $("meta-demo-btn").addEventListener("click", metaDemo);
  rollShop();
});
