from app.schemas import UnitStats, BattleResult


def simulate_battle(team_a: list[UnitStats], team_b: list[UnitStats]) -> BattleResult:
    power_a = sum(u.power for u in team_a)
    power_b = sum(u.power for u in team_b)
    gap = abs(power_a - power_b)

    if power_a > power_b:
        winner = "team_a"
    elif power_b > power_a:
        winner = "team_b"
    else:
        winner = "draw"

    logs = [
        f"Team A: {len(team_a)}개 유닛, 총 파워 {round(power_a, 2)}",
        f"Team B: {len(team_b)}개 유닛, 총 파워 {round(power_b, 2)}",
        f"결과: {winner.upper()} 승리 (파워 차이 {round(gap, 2)})",
    ]

    return BattleResult(
        winner=winner,
        team_a_power=round(power_a, 2),
        team_b_power=round(power_b, 2),
        score_gap=round(gap, 2),
        logs=logs,
    )
