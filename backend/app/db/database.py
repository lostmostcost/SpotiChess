from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String
from sqlalchemy.ext.asyncio import AsyncAttrs, AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = "sqlite+aiosqlite:///./round_history.db"


class Base(AsyncAttrs, DeclarativeBase):
    pass


class RoundHistory(Base):
    __tablename__ = "round_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    winner: Mapped[str] = mapped_column(String(8), nullable=False)
    score_gap: Mapped[float] = mapped_column(Float, nullable=False)
    logs: Mapped[list] = mapped_column(JSON, nullable=False)
    team_a: Mapped[list] = mapped_column(JSON, nullable=False)
    team_b: Mapped[list] = mapped_column(JSON, nullable=False)


engine: AsyncEngine = create_async_engine(DATABASE_URL, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
