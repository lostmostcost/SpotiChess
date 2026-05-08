import type { TrackCard, UnitStats } from "../types/game";

type Props = {
  track: TrackCard | null;
  unit: UnitStats | null;
  selectionRate: number;
  loading: boolean;
  onSelectionRateChange: (value: number) => void;
  onCompute: () => void;
  onAddToTeamA: () => void;
  onAddToTeamB: () => void;
};

export function UnitDetailPanel({
  track,
  unit,
  selectionRate,
  loading,
  onSelectionRateChange,
  onCompute,
  onAddToTeamA,
  onAddToTeamB,
}: Props) {
  return (
    <section className="panel">
      <h2>Unit Detail</h2>
      {!track ? (
        <p>Select a track in the shop first.</p>
      ) : (
        <>
          <p>
            <strong>{track.name}</strong> - {track.artist}
          </p>
          <label className="sliderRow">
            Selection Rate: {selectionRate}%
            <input
              type="range"
              min={0}
              max={95}
              value={selectionRate}
              onChange={(e) => onSelectionRateChange(Number(e.target.value))}
            />
          </label>
          <div className="row">
            <button onClick={onCompute} disabled={loading}>
              {loading ? "Computing..." : "Compute Stats"}
            </button>
            <button onClick={onAddToTeamA} disabled={!unit}>
              Add to Team A
            </button>
            <button onClick={onAddToTeamB} disabled={!unit}>
              Add to Team B
            </button>
          </div>
          {unit && (
            <div className="statsBox">
              <p>HP: {unit.hp}</p>
              <p>ATK: {unit.attack}</p>
              <p>AS: {unit.attack_speed}</p>
              <p className="power">Power: {unit.power}</p>
              <p>Cost: {unit.cost}</p>
              <p>Synergy: {unit.synergy_tags.join(", ")}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
