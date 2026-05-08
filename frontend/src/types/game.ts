export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: {
    total: number;
  };
  images?: Array<{ url: string }>;
};

export type TrackCard = {
  id: string;
  name: string;
  duration_ms: number;
  popularity: number;
  explicit: boolean;
  artists: Array<{ id: string; name: string }>;
};

export type UnitStats = {
  track_id: string;
  name: string;
  artist: string;
  hp: number;
  attack: number;
  attack_speed: number;
  power: number;
  cost: number;
  synergy_tags: string[];
  explicit_proc_chance: number;
};

export type BattleResult = {
  winner: "A" | "B" | "DRAW";
  score_gap: number;
  logs: string[];
};

export type RoundSimulateResponse = BattleResult & {
  computed_team_a: UnitStats[];
  computed_team_b: UnitStats[];
};
