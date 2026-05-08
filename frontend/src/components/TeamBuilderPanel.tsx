import type { UnitStats } from "../types/game";

type Props = {
  teamA: UnitStats[];
  teamB: UnitStats[];
  onReset: () => void;
};

export function TeamBuilderPanel({ teamA, teamB, onReset }: Props) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Team Builder</h2>
        <button onClick={onReset}>Reset Teams</button>
      </div>
      <div className="teamGrid">
        <div>
          <h3>Team A ({teamA.length}/3)</h3>
          {teamA.map((u) => (
            <p key={`a-${u.track_id}-${u.power}`}>
              {u.name} ({u.power})
            </p>
          ))}
        </div>
        <div>
          <h3>Team B ({teamB.length}/3)</h3>
          {teamB.map((u) => (
            <p key={`b-${u.track_id}-${u.power}`}>
              {u.name} ({u.power})
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
