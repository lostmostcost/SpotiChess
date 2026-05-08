from __future__ import annotations

import asyncio

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc, select

from app.db.database import RoundHistory, SessionLocal, init_db
from app.schemas import (
    RoundHistoryItem,
    RoundSimulateRequest,
    RoundSimulateResponse,
)
from app.services.battle import simulate
from app.services.mapper import compute_unit_stats
from app.services.spotify_service import SpotifyService

app = FastAPI(title="SpotiChess Realtime Backend", version="0.2.0")
spotify = SpotifyService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "mode": "realtime-spotify"}


@app.get("/spotify/search/artists")
async def search_artists(
    q: str = Query(min_length=1),
    market: str = "KR",
    limit: int = Query(default=8, ge=1, le=30),
) -> dict:
    try:
        items = await spotify.search_artists(query=q, market=market, limit=limit)
        # Search payloads can be sparse; enrich with /artists/{id} for followers/genres.
        detail_tasks = [spotify.get_artist(item["id"]) for item in items if item.get("id")]
        details = await asyncio.gather(*detail_tasks, return_exceptions=True)
        detail_by_id = {
            detail.get("id"): detail
            for detail in details
            if isinstance(detail, dict) and detail.get("id")
        }
        enriched = []
        for item in items:
            artist_id = item.get("id")
            detail = detail_by_id.get(artist_id, {})
            enriched.append(
                {
                    "id": artist_id,
                    "name": item.get("name", ""),
                    "images": item.get("images", []),
                    "popularity": detail.get("popularity", item.get("popularity", 0)),
                    "followers": detail.get("followers", {"total": 0}),
                    "genres": detail.get("genres", item.get("genres", [])),
                }
            )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Spotify search failed: {exc}") from exc
    return {"items": enriched}


@app.get("/spotify/artists/{artist_id}")
async def artist_profile(artist_id: str, market: str = "KR") -> dict:
    try:
        artist = await spotify.get_artist(artist_id)
        top_tracks = await spotify.get_artist_top_tracks(artist_id, market=market)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Spotify artist fetch failed: {exc}") from exc
    return {"artist": artist, "top_tracks": top_tracks}


@app.post("/rounds/simulate", response_model=RoundSimulateResponse)
async def simulate_round(payload: RoundSimulateRequest) -> RoundSimulateResponse:
    if not payload.team_a or not payload.team_b:
        raise HTTPException(status_code=400, detail="team_a and team_b are both required.")

    async def build_units(team_inputs):
        result = []
        for item in team_inputs:
            track = await spotify.get_track(item.track_id, market=payload.market)
            if not track.get("artists"):
                continue
            artist_id = track["artists"][0]["id"]
            artist = await spotify.get_artist(artist_id)
            unit = compute_unit_stats(
                track=track,
                artist=artist,
                selection_rate_percent=item.selection_rate_percent,
                star_level=item.star_level,
            )
            result.append(unit)
        return result

    try:
        computed_team_a = await build_units(payload.team_a)
        computed_team_b = await build_units(payload.team_b)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Spotify track processing failed: {exc}") from exc

    winner, score_gap, logs = simulate(computed_team_a, computed_team_b)
    response = RoundSimulateResponse(
        winner=winner,
        score_gap=score_gap,
        logs=logs,
        computed_team_a=computed_team_a,
        computed_team_b=computed_team_b,
    )

    async with SessionLocal() as session:
        history = RoundHistory(
            winner=winner,
            score_gap=score_gap,
            logs=logs,
            team_a=[item.model_dump() for item in computed_team_a],
            team_b=[item.model_dump() for item in computed_team_b],
        )
        session.add(history)
        await session.commit()

    return response


@app.get("/rounds/history", response_model=list[RoundHistoryItem])
async def rounds_history(limit: int = Query(default=20, ge=1, le=100)) -> list[RoundHistoryItem]:
    async with SessionLocal() as session:
        rows = (
            await session.execute(select(RoundHistory).order_by(desc(RoundHistory.id)).limit(limit))
        ).scalars()
        return [
            RoundHistoryItem(
                id=row.id,
                created_at=row.created_at,
                winner=row.winner,
                score_gap=row.score_gap,
                logs=row.logs,
                team_a=row.team_a,
                team_b=row.team_b,
            )
            for row in rows
        ]
