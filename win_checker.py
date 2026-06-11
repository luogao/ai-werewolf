"""胜负判定"""
from __future__ import annotations
from typing import List, Tuple, Optional
from models import PlayerState, Role


def check_win(players: List[PlayerState]) -> Tuple[Optional[str], str]:
    """检查游戏是否结束

    Returns:
        (winner, reason):
            winner = "wolf" / "good" / None (游戏未结束)
            reason = 描述文字
    """
    alive_wolves = sum(1 for p in players if p.alive and p.role == Role.WEREWOLF)
    alive_good = sum(1 for p in players if p.alive and p.role != Role.WEREWOLF)

    # 狼人全灭 → 好人胜
    if alive_wolves == 0:
        return ("good", "所有狼人已被消灭，好人阵营获胜！")

    # 狼人数量 >= 好人数量 → 狼人胜
    if alive_wolves >= alive_good:
        return ("wolf", f"狼人数量({alive_wolves}) >= 好人数量({alive_good})，狼人阵营获胜！")

    return (None, "")


def game_over_info(players: List[PlayerState], winner: str, reason: str) -> str:
    """生成游戏结束信息"""
    lines = [
        "=" * 50,
        "  游戏结束！",
        f"  获胜方：{'狼人阵营 🐺' if winner == 'wolf' else '好人阵营 🌟'}",
        f"  原因：{reason}",
        "",
        "  最终身份揭晓：",
    ]
    for p in players:
        status = "存活" if p.alive else "死亡"
        role = p.role.display_name
        lines.append(f"    [{p.player_id}] {p.name} - {role} ({status})")
    lines.append("=" * 50)
    return "\n".join(lines)
