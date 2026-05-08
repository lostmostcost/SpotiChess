import type { TrackCard } from "../types/game";

type Props = {
  items: TrackCard[];
  selectedTrackId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (track: TrackCard) => void;
};

export function ShopPanel({ items, selectedTrackId, loading, onRefresh, onSelect }: Props) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>Shop</h2>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? "Loading..." : "Roll Shop"}
        </button>
      </div>
      <div className="cardGrid">
        {items.map((item) => {
          const selected = selectedTrackId === item.track_id;
          return (
            <button
              key={item.track_id}
              className={`card ${selected ? "selected" : ""}`}
              onClick={() => onSelect(item)}
            >
              <strong>{item.name}</strong>
              <span>{item.artist}</span>
              <span>Popularity: {item.popularity}</span>
              <span>Genres: {item.genres.join(", ") || "None"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
