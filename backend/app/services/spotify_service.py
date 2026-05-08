from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx

SECRETS_PATH = Path(__file__).resolve().parents[3] / "Secrets" / "api.json"
ACCOUNTS_BASE = "https://accounts.spotify.com"
API_BASE = "https://api.spotify.com/v1"


class SpotifyService:
    def __init__(self) -> None:
        self.client_id, self.client_secret = self._load_credentials()
        self._token: str | None = None

    def _load_credentials(self) -> tuple[str, str]:
        raw = json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
        client_id = raw.get("id")
        client_secret = raw.get("secret")
        if not client_id or not client_secret:
            raise ValueError("Secrets/api.json must include id and secret.")
        return client_id, client_secret

    async def _get_access_token(self) -> str:
        if self._token:
            return self._token
        auth = f"{self.client_id}:{self.client_secret}".encode("utf-8")
        header = base64.b64encode(auth).decode("utf-8")
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{ACCOUNTS_BASE}/api/token",
                headers={
                    "Authorization": f"Basic {header}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()
            self._token = response.json()["access_token"]
            return self._token

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        token = await self._get_access_token()
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{API_BASE}{path}",
                headers={"Authorization": f"Bearer {token}"},
                params=params or {},
            )
            if response.status_code == 401:
                self._token = None
                token = await self._get_access_token()
                response = await client.get(
                    f"{API_BASE}{path}",
                    headers={"Authorization": f"Bearer {token}"},
                    params=params or {},
                )
            response.raise_for_status()
            return response.json()

    async def search_artists(self, query: str, market: str = "KR", limit: int = 10) -> list[dict[str, Any]]:
        data = await self._get(
            "/search",
            params={"q": query, "type": "artist", "market": market, "limit": limit},
        )
        return data.get("artists", {}).get("items", [])

    async def search_tracks(self, query: str, market: str = "KR", limit: int = 10) -> list[dict[str, Any]]:
        data = await self._get(
            "/search",
            params={"q": query, "type": "track", "market": market, "limit": limit},
        )
        return data.get("tracks", {}).get("items", [])

    async def get_artist(self, artist_id: str) -> dict[str, Any]:
        return await self._get(f"/artists/{artist_id}")

    async def get_artist_top_tracks(self, artist_id: str, market: str = "KR") -> list[dict[str, Any]]:
        try:
            data = await self._get(f"/artists/{artist_id}/top-tracks", params={"market": market})
            return data.get("tracks", [])
        except httpx.HTTPStatusError as exc:
            # Some app configurations can call search endpoints but get 403 on top-tracks.
            # Keep using Spotify APIs by deriving a track list from artist-name search.
            if exc.response.status_code != 403:
                raise
            artist = await self.get_artist(artist_id)
            artist_name = artist.get("name", "").strip()
            if not artist_name:
                raise
            tracks = await self.search_tracks(f'artist:"{artist_name}"', market=market, limit=10)
            filtered = []
            for track in tracks:
                artists = track.get("artists", [])
                if any(a.get("id") == artist_id for a in artists):
                    filtered.append(track)
            return filtered or tracks

    async def get_track(self, track_id: str, market: str = "KR") -> dict[str, Any]:
        return await self._get(f"/tracks/{track_id}", params={"market": market})
