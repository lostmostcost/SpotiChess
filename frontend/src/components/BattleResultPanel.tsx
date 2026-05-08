import type { BattleResult } from "../types/game";

type Props = {
  result: BattleResult | null;
  loading: boolean;
  canBattle: boolean;
  onSimulate: () => void;
};

export function BattleResultPanel({ result, loading, canBattle, onSimulate }: Props) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Battle Result</h2>
        <button onClick={onSimulate} disabled={!canBattle || loading}>
          {loading ? "Simulating..." : "Simulate Battle"}
        </button>
      </div>
      {!result ? (
        <p>Build both teams and run battle.</p>
      ) : (
        <div className="resultBox">
          <p>
            Winner: <strong>{result.winner}</strong>
          </p>
          <p>Score Gap: {result.score_gap}</p>
          <ul>
            {result.logs.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
