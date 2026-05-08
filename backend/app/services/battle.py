from app.schemas import UnitStats


def team_score(units: list[UnitStats]) -> float:
    score = 0.0
    for unit in units:
        score += unit.power + (unit.hp * 0.1) + (unit.attack * 0.8) + (unit.attack_speed * 8)
    return score


def simulate(team_a: list[UnitStats], team_b: list[UnitStats]) -> tuple[str, float, list[str]]:
    if not team_a or not team_b:
        return "DRAW", 0.0, ["One or both teams are empty.", "No battle executed."]

    score_a = team_score(team_a)
    score_b = team_score(team_b)
    gap = round(abs(score_a - score_b), 1)
    if abs(score_a - score_b) < 1:
        winner = "DRAW"
    else:
        winner = "A" if score_a > score_b else "B"

    logs = [
        f"Team A score: {round(score_a, 1)}",
        f"Team B score: {round(score_b, 1)}",
        f"Winner: {winner}",
    ]
    return winner, gap, logs
