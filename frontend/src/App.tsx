import { useEffect, useState } from "react";
import { getArtistTopTracks, healthCheck, searchArtists, simulateBattle } from "./api/client";
import type { RoundSimulateResponse, SpotifyArtist, TrackCard, UnitStats } from "./types/game";

const MAX_TEAM_SIZE = 3;
const RANDOM_PERSONA_SEEDS = [
  "kpop",
  "indie",
  "hip hop korea",
  "trot",
  "krnb",
  "band",
  "electronic",
  "new music friday korea",
];
type Screen = "start" | "persona" | "shop" | "battle";
type TeamSlot = {
  track_id: string;
  selection_rate_percent: number;
  star_level: number;
  name: string;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [persona, setPersona] = useState<SpotifyArtist | null>(null);
  const [personaQuery, setPersonaQuery] = useState("");
  const [personaResults, setPersonaResults] = useState<SpotifyArtist[]>([]);
  const [loadingPersona, setLoadingPersona] = useState(false);
  const [status, setStatus] = useState("Checking backend...");
  const [shopItems, setShopItems] = useState<TrackCard[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackCard | null>(null);
  const [selectionRate, setSelectionRate] = useState(5);
  const [teamA, setTeamA] = useState<TeamSlot[]>([]);
  const [teamB, setTeamB] = useState<TeamSlot[]>([]);
  const [battleResult, setBattleResult] = useState<RoundSimulateResponse | null>(null);
  const [computedTeamA, setComputedTeamA] = useState<UnitStats[]>([]);
  const [computedTeamB, setComputedTeamB] = useState<UnitStats[]>([]);
  const [loadingShop, setLoadingShop] = useState(false);
  const [loadingBattle, setLoadingBattle] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const health = await healthCheck();
        setStatus(`${health.mode ?? health.service ?? "backend"}: ${health.status}`);
      } catch {
        setStatus("Backend unavailable");
      }
    })();
    const seed = RANDOM_PERSONA_SEEDS[Math.floor(Math.random() * RANDOM_PERSONA_SEEDS.length)];
    setPersonaQuery(seed);
    void handleSearchPersona(seed);
  }, []);

  async function handleSearchPersona(forcedQuery?: string) {
    setLoadingPersona(true);
    setError("");
    try {
      const query = (forcedQuery ?? personaQuery).trim() || "kpop";
      const items = await searchArtists(query, "KR", 8);
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      setPersonaResults(shuffled);
      if (!persona && items.length > 0) {
        setPersona(shuffled[0]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingPersona(false);
    }
  }

  async function handleLoadShop() {
    if (!persona) return;
    setLoadingShop(true);
    setError("");
    try {
      const tracks = await getArtistTopTracks(persona.id, "KR");
      const items = tracks.slice(0, 8);
      setShopItems(items.length ? items : tracks);
      setSelectedTrack(items[0] ?? null);
      setBattleResult(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingShop(false);
    }
  }

  function addToTeam(team: "A" | "B") {
    if (!selectedTrack) return;
    const slot: TeamSlot = {
      track_id: selectedTrack.id,
      selection_rate_percent: selectionRate,
      star_level: 1,
      name: selectedTrack.name,
    };
    if (team === "A") {
      setTeamA((prev) => (prev.length >= MAX_TEAM_SIZE ? prev : [...prev, slot]));
    } else {
      setTeamB((prev) => (prev.length >= MAX_TEAM_SIZE ? prev : [...prev, slot]));
    }
  }

  function resetRun() {
    setPersona(null);
    setSelectedTrack(null);
    setTeamA([]);
    setTeamB([]);
    setBattleResult(null);
    setComputedTeamA([]);
    setComputedTeamB([]);
    setSelectionRate(5);
    setScreen("start");
  }

  async function handleSimulate() {
    setLoadingBattle(true);
    setError("");
    try {
      const result = await simulateBattle(teamA, teamB, "KR");
      setBattleResult(result);
      setComputedTeamA(result.computed_team_a);
      setComputedTeamB(result.computed_team_b);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingBattle(false);
    }
  }

  const canBattle = teamA.length > 0 && teamB.length > 0;

  return (
    <main className="gameRoot">
      <div className="hudBar">
        <span>Server: {status}</span>
        <span>Persona: {persona?.name ?? "None"}</span>
        <span>
          Route: {screen === "start" ? "Index" : screen === "persona" ? "Persona Select" : screen === "shop" ? "Shop" : "Battle"}
        </span>
      </div>

      {error && <p className="errorBanner">{error}</p>}

      {screen === "start" && (
        <section className="scene">
          <h1 className="title">SPOTICHESS</h1>
          <p className="subtitle">Data-driven auto battler with democratic rebalancing.</p>
          <div className="actionRow">
            <button className="btnMain" onClick={() => setScreen("persona")}>
              Start Run
            </button>
          </div>
        </section>
      )}

      {screen === "persona" && (
        <section className="scene">
          <h2 className="sceneTitle">Choose Persona Artist</h2>
          <p className="sceneDesc">Search Spotify artist and pick one persona.</p>
          <div className="shopToolbar">
            <input
              value={personaQuery}
              onChange={(e) => setPersonaQuery(e.target.value)}
              placeholder="Search artist name or genre..."
            />
            <button className="btnMain" onClick={() => void handleSearchPersona()} disabled={loadingPersona}>
              {loadingPersona ? "Searching..." : "Search"}
            </button>
          </div>
          <div className="personaGrid">
            {personaResults.map((item) => (
              <button
                key={item.id}
                className={`personaCard ${persona?.id === item.id ? "active" : ""}`}
                onClick={() => setPersona(item)}
              >
                <strong>{item.name}</strong>
                <span>Followers: {item.followers?.total?.toLocaleString?.() ?? 0}</span>
                <span>{item.genres?.slice(0, 2).join(" / ") || "No genre tags"}</span>
              </button>
            ))}
          </div>
          <div className="actionRow">
            <button className="btnGhost" onClick={() => setScreen("start")}>
              Back
            </button>
            <button
              className="btnMain"
              onClick={() => {
                void handleLoadShop();
                setScreen("shop");
              }}
              disabled={!persona}
            >
              Enter Shop
            </button>
          </div>
        </section>
      )}

      {screen === "shop" && (
        <section className="scene">
          <div className="sceneHeader">
            <h2 className="sceneTitle">Shop Phase</h2>
            <div className="actionRow">
              <button className="btnGhost" onClick={() => setScreen("persona")}>
                Persona
              </button>
              <button className="btnMain" onClick={() => setScreen("battle")}>
                Battle Phase
              </button>
            </div>
          </div>

          <div className="shopToolbar">
            <button className="btnMain" onClick={handleLoadShop} disabled={loadingShop || !persona}>
              {loadingShop ? "Loading..." : "Load Top Tracks"}
            </button>
            <label>
              Selection Rate: <strong>{selectionRate}%</strong>
              <input
                type="range"
                min={0}
                max={95}
                value={selectionRate}
                onChange={(e) => setSelectionRate(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="unitGrid">
            {shopItems.map((item) => (
              <button
                key={item.id}
                className={`unitCard ${selectedTrack?.id === item.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedTrack(item);
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.artists?.[0]?.name ?? "Unknown Artist"}</span>
                <span>POP {item.popularity}</span>
                <span>{item.explicit ? "Explicit" : "Clean"}</span>
              </button>
            ))}
          </div>

          <div className="statPanel">
            <h3>Selected Unit</h3>
            {!selectedTrack ? (
              <p>Select a unit from shop cards.</p>
            ) : (
              <>
                <p>
                  {selectedTrack.name} - {selectedTrack.artists?.[0]?.name ?? "Unknown Artist"}
                </p>
                <div className="actionRow">
                  <button className="btnGhost" onClick={() => addToTeam("A")}>
                    Add Team A
                  </button>
                  <button className="btnGhost" onClick={() => addToTeam("B")}>
                    Add Team B
                  </button>
                </div>
                <div className="stats">
                  <span>Track ID {selectedTrack.id.slice(0, 8)}...</span>
                  <span>Duration {(selectedTrack.duration_ms / 1000).toFixed(0)}s</span>
                  <span>Selection Rate {selectionRate}%</span>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {screen === "battle" && (
        <section className="scene">
          <div className="sceneHeader">
            <h2 className="sceneTitle">Battle Phase</h2>
            <div className="actionRow">
              <button className="btnGhost" onClick={() => setScreen("shop")}>
                Back to Shop
              </button>
              <button className="btnGhost" onClick={resetRun}>
                End Run
              </button>
            </div>
          </div>

          <div className="battleBoard">
            <div className="teamPanel">
              <h3>Team A ({teamA.length}/{MAX_TEAM_SIZE})</h3>
              {teamA.map((unit, idx) => (
                <p key={`${unit.track_id}-a-${idx}`}>{unit.name} - SR {unit.selection_rate_percent}%</p>
              ))}
              {computedTeamA.length > 0 && <h4>Computed</h4>}
              {computedTeamA.map((unit, idx) => (
                <p key={`${unit.track_id}-ca-${idx}`}>{unit.name} - PWR {unit.power}</p>
              ))}
            </div>
            <div className="versus">VS</div>
            <div className="teamPanel">
              <h3>Team B ({teamB.length}/{MAX_TEAM_SIZE})</h3>
              {teamB.map((unit, idx) => (
                <p key={`${unit.track_id}-b-${idx}`}>{unit.name} - SR {unit.selection_rate_percent}%</p>
              ))}
              {computedTeamB.length > 0 && <h4>Computed</h4>}
              {computedTeamB.map((unit, idx) => (
                <p key={`${unit.track_id}-cb-${idx}`}>{unit.name} - PWR {unit.power}</p>
              ))}
            </div>
          </div>

          <div className="actionRow">
            <button className="btnMain" onClick={handleSimulate} disabled={!canBattle || loadingBattle}>
              {loadingBattle ? "Simulating..." : "Simulate Battle"}
            </button>
            <button
              className="btnGhost"
              onClick={() => {
                setTeamA([]);
                setTeamB([]);
                setBattleResult(null);
              }}
            >
              Reset Teams
            </button>
          </div>

          <div className="resultPanel">
            {!battleResult ? (
              <p>Prepare both teams and run battle.</p>
            ) : (
              <>
                <h3>Winner: {battleResult.winner}</h3>
                <p>Score Gap: {battleResult.score_gap}</p>
                {battleResult.logs.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
