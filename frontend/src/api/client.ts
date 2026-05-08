import type { RoundSimulateResponse, SpotifyArtist, TrackCard, UnitStats } from "../types/game";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function healthCheck(): Promise<{ status: string; mode?: string; service?: string }> {
  return request("/health");
}

export async function searchArtists(query: string, market = "KR", limit = 8): Promise<SpotifyArtist[]> {
  const data = await request<{ items: SpotifyArtist[] }>(
    `/spotify/search/artists?q=${encodeURIComponent(query)}&market=${market}&limit=${limit}`
  );
  return data.items;
}

export async function getArtistTopTracks(artistId: string, market = "KR"): Promise<TrackCard[]> {
  const data = await request<{ top_tracks: TrackCard[] }>(
    `/spotify/artists/${artistId}?market=${market}`
  );
  return data.top_tracks;
}

export async function simulateBattle(
  teamA: Array<{ track_id: string; selection_rate_percent: number; star_level: number }>,
  teamB: Array<{ track_id: string; selection_rate_percent: number; star_level: number }>,
  market = "KR"
): Promise<RoundSimulateResponse> {
  return request<RoundSimulateResponse>("/rounds/simulate", {
    method: "POST",
    body: JSON.stringify({
      team_a: teamA,
      team_b: teamB,
      market,
    }),
  });
}

export async function getRoundHistory(limit = 10) {
  return request(`/rounds/history?limit=${limit}`);
}
