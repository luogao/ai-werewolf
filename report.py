"""Markdown 战报生成"""
from __future__ import annotations
import os
from datetime import datetime
from typing import List, Optional
from models import (
    GameLog, PlayerState, Role, DeathRecord, DeathReason,
    NightAction, VoteResult, Phase,
)


def generate_report(log: GameLog) -> str:
    """生成完整 Markdown 战报"""
    lines: List[str] = []

    # 标题
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines.append(f"# 🐺 AI 狼人杀战报 — {now}")
    lines.append("")

    # 玩家阵容
    lines.append("## 📋 玩家阵容")
    lines.append("")
    lines.append("| 编号 | 名称 | 模型 | 角色 | 结果 |")
    lines.append("|:---:|:---:|:---:|:---:|:---:|")
    for p in log.players:
        death = _death_info(log.deaths, p.player_id)
        role = p.role.display_name
        if death:
            result = f"第{death.day}天{death.details}"
        else:
            result = "存活" if p.alive else "未知"
        lines.append(f"| {p.player_id} | {p.name} | {p.model} | {role} | {result} |")
    lines.append("")

    # 每一轮详情
    for i, night in enumerate(log.nights):
        day = night.day
        lines.append(f"## 🌙 第 {day} 夜")
        lines.append("")

        # 狼人行动
        if night.wolf_target is not None:
            target_name = _player_name(log.players, night.wolf_target)
            lines.append(f"- 🐺 狼人选择杀害：**{target_name}**（编号 {night.wolf_target}）")
        else:
            lines.append("- 🐺 狼人未行动")

        # 预言家
        if night.seer_target is not None:
            seer_name = _find_role_name(log.players, Role.SEER)
            target_name = _player_name(log.players, night.seer_target)
            lines.append(f"- 🔮 预言家 **{seer_name}** 查验了 **{target_name}** → **{night.seer_result}**")

        # 女巫
        if night.witch_saved:
            lines.append("- 💊 女巫使用 **解药** 救人")
        if night.witch_poisoned is not None:
            poison_name = _player_name(log.players, night.witch_poisoned)
            lines.append(f"- ☠️ 女巫使用 **毒药** 毒杀了 **{poison_name}**")

        # 死亡结算
        if night.deaths:
            names = "、".join(_player_name(log.players, d.player_id) for d in night.deaths)
            lines.append(f"- 💀 本轮死亡：**{names}**")
        else:
            lines.append("- ✨ 平安夜，无人死亡")

        lines.append("")

        # 白天阶段
        lines.append(f"## ☀️ 第 {day} 天 — 白天讨论")
        lines.append("")

        # 发言
        if i < len(log.speeches):
            speeches = log.speeches[i]
            lines.append("### 🎤 发言记录")
            lines.append("")
            for s in speeches:
                name = s.get("name", "?")
                pid = s.get("player_id", "?")
                content = s.get("content", "")
                lines.append(f"**[{pid}] {name}**：{content}")
                lines.append("")

        # 投票
        if i < len(log.votes):
            vr: VoteResult = log.votes[i]
            lines.append("### 🗳️ 投票结果")
            lines.append("")
            lines.append("| 投票人 | 投票目标 |")
            lines.append("|:---:|:---:|")
            for voter_id, target_id in vr.votes.items():
                voter_name = _player_name(log.players, voter_id)
                target_name = _player_name(log.players, target_id)
                lines.append(f"| {voter_name} | {target_name} |")
            lines.append("")

            if vr.eliminated is not None:
                elim_name = _player_name(log.players, vr.eliminated)
                vote_count = vr.tally.get(vr.eliminated, 0)
                lines.append(f"⚖️ **{elim_name}** 以 {vote_count} 票被投票放逐。")
            else:
                lines.append("⚖️ 平票，无人被放逐。")
            lines.append("")

    # 最终结果
    lines.append("## 🏆 最终结果")
    lines.append("")
    if log.winner == "wolf":
        lines.append("🐺 **狼人阵营胜利！**")
    elif log.winner == "good":
        lines.append("🎉 **好人阵营胜利！**")
    elif log.winner == "draw":
        lines.append("🤝 **平局！**")
    else:
        lines.append(f"结果：{log.winner}")
    lines.append("")
    lines.append(f"> {log.winner_reason}")
    lines.append("")

    if log.seed is not None:
        lines.append(f"---")
        lines.append(f"*随机种子: {log.seed}*")

    return "\n".join(lines)


def save_report(report: str, reports_dir: str = "reports") -> str:
    """保存战报到文件"""
    os.makedirs(reports_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(reports_dir, f"werewolf_{ts}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(report)
    return path


# ─── 辅助 ───

def _player_name(players: List[PlayerState], pid: int) -> str:
    for p in players:
        if p.player_id == pid:
            return p.name
    return f"未知({pid})"


def _find_role_name(players: List[PlayerState], role: Role) -> str:
    for p in players:
        if p.role == role:
            return p.name
    return "未知"


def _death_info(deaths: List[DeathRecord], pid: int) -> Optional[DeathRecord]:
    for d in deaths:
        if d.player_id == pid:
            return d
    return None
