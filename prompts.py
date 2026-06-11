"""Prompt 模板 —— 固定 System Prompt（游戏规则）+ User Prompt（身份/人格/决策）

架构：
  System Prompt = 固定游戏规则（所有玩家一致，所有阶段不变）
  User Prompt   = 身份揭示 + 人格设定 + 当前局势 + 决策需求（每次不同）

严格信息隔离：好人 User Prompt 绝不泄露狼人身份
"""
from __future__ import annotations
from typing import List, Optional, Dict
from models import PlayerState, Role


# ═══════════════════════════════════════════════════════════════
# 固定 System Prompt —— 游戏规则（所有玩家、所有阶段共用）
# ═══════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """你是一场狼人杀游戏的参与者。以下是完整的游戏规则，所有玩家都了解这些规则。

## 游戏规则

### 阵营与角色
- **好人阵营**：预言家、女巫、猎人、村民
- **狼人阵营**：3 名狼人

### 角色能力
- **狼人**：每晚共同决定杀死一名玩家
- **预言家**：每晚可以查验一名玩家的阵营（好人/狼人）
- **女巫**：拥有一瓶解药（救被狼人杀死的人）和一瓶毒药（毒杀任意一人），各只能使用一次
- **猎人**：被杀死时（无论死因）可以开枪带走一名存活玩家
- **村民**：无特殊能力，但通过分析和投票发挥作用

### 游戏流程
1. **夜晚**：狼人选择杀人 → 预言家查验 → 女巫决定是否用药
2. **白天**：宣布死讯 → 所有存活玩家依次发言讨论 → 投票放逐一人

### 胜利条件
- **好人阵营胜利**：所有狼人被消灭
- **狼人阵营胜利**：狼人存活数量 ≥ 好人存活数量

### 重要规则
- 死亡玩家不能再发言或投票
- 被投票放逐的玩家不能发动技能（猎人除外，猎人可以开枪）
- 所有发言必须用中文
- 投票不能投自己

你现在会收到你的身份信息和当前局势，请根据你的角色做出合理的决策。"""


# ═══════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════

def _alive_players_list(players: List[PlayerState], exclude_id: Optional[int] = None) -> str:
    """生成存活玩家列表（不含角色信息）"""
    lines = []
    for p in players:
        if not p.alive:
            continue
        if p.player_id == exclude_id:
            continue
        lines.append(f"  [{p.player_id}] {p.name}")
    return "\n".join(lines) if lines else "  (无)"


def _dead_players_list(players: List[PlayerState]) -> str:
    lines = []
    for p in players:
        if not p.alive:
            lines.append(f"  [{p.player_id}] {p.name} (已死亡)")
    return "\n".join(lines) if lines else "  (无)"


def _format_night_history(history: List[Dict]) -> str:
    if not history:
        return "  (第一夜，暂无历史)"
    lines = []
    for h in history:
        day = h.get("day", "?")
        deaths = h.get("deaths", [])
        if deaths:
            names = "、".join(d.get("name", "?") for d in deaths)
            lines.append(f"  第{day}夜: {names} 死亡")
        else:
            lines.append(f"  第{day}夜: 平安夜")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 身份提示 + 开局人格注入
# ═══════════════════════════════════════════════════════════════

def role_reveal_prompt(player: PlayerState, teammates: Optional[List[PlayerState]] = None,
                       personality: str = "") -> str:
    """开局身份揭示 prompt（作为第一条 user message）"""
    role = player.role
    lines = [f"你的身份是【{role.display_name}】。"]

    if role == Role.WEREWOLF:
        teammate_names = "、".join(t.name for t in (teammates or []))
        lines.append(f"你的狼人队友是：{teammate_names}")
        lines.append("你们需要在夜晚商量杀谁，白天伪装成好人。")
    elif role == Role.SEER:
        lines.append("你每晚可以查验一名玩家是好人还是狼人。")
    elif role == Role.WITCH:
        lines.append("你有一瓶解药（救人）和一瓶毒药（毒人），各只能用一次。")
    elif role == Role.HUNTER:
        lines.append("你被杀死时可以开枪带走一名玩家。")
    else:
        lines.append("你没有特殊技能，但你的分析和投票至关重要。")

    if personality:
        lines.append(f"\n你的性格特点：{personality}")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 夜晚阶段 —— User Prompt
# ═══════════════════════════════════════════════════════════════

def wolf_kill_prompt(player: PlayerState, players: List[PlayerState],
                     night_history: List[Dict], personality: str = "") -> tuple:
    """狼人杀人"""
    alive = _alive_players_list(players, exclude_id=player.player_id)
    history_str = _format_night_history(night_history)

    user = f"""现在是夜晚阶段。

你是【{player.name}】(编号 {player.player_id})，身份是【狼人】。
{f'你的性格：{personality}' if personality else ''}
请选择今晚要杀害的目标。你的狼人队友会独立做出选择，最终取多数意见。

存活的其他玩家：
{alive}

历史夜晚行动：
{history_str}

请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{{"kill": <玩家编号>}}"""
    return SYSTEM_PROMPT, user


def seer_check_prompt(player: PlayerState, players: List[PlayerState],
                      known_results: List[Dict], night_history: List[Dict],
                      personality: str = "") -> tuple:
    """预言家查验"""
    alive = _alive_players_list(players, exclude_id=player.player_id)
    known_str = ""
    if known_results:
        known_str = "你之前查验的结果：\n"
        for r in known_results:
            known_str += f"  - {r['name']}: {'狼人' if r['is_wolf'] else '好人'}\n"

    user = f"""现在是夜晚阶段。

你是【{player.name}】(编号 {player.player_id})，身份是【预言家】。
{f'你的性格：{personality}' if personality else ''}
请选择今晚要查验的玩家。

存活的其他玩家：
{alive}

{known_str}
请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{{"check": <玩家编号>}}"""
    return SYSTEM_PROMPT, user


def witch_action_prompt(player: PlayerState, players: List[PlayerState],
                        killed_name: str, killed_id: int,
                        has_antidote: bool, has_poison: bool,
                        night_history: List[Dict], personality: str = "") -> tuple:
    """女巫行动"""
    alive = _alive_players_list(players, exclude_id=player.player_id)

    user = f"""现在是夜晚阶段。

你是【{player.name}】(编号 {player.player_id})，身份是【女巫】。
{f'你的性格：{personality}' if personality else ''}
今晚被狼人杀害的是：{killed_name}（编号 {killed_id}）。

你的状态：
- 解药：{"未使用（可以救人）" if has_antidote else "已使用"}
- 毒药：{"未使用（可以毒人）" if has_poison else "已使用"}

存活的其他玩家：
{alive}

请决定你的行动。你可以：
1. 用解药救被杀的人（仅当解药未使用时）
2. 用毒药毒杀某人（仅当毒药未使用时）
3. 什么都不做

请用以下 JSON 格式回复：
{{"save": true/false, "poison": <玩家编号或null>}}"""
    return SYSTEM_PROMPT, user


def hunter_shoot_prompt(player: PlayerState, players: List[PlayerState],
                        reason: str, speech_log: List[Dict],
                        personality: str = "") -> tuple:
    """猎人开枪"""
    alive = _alive_players_list(players, exclude_id=player.player_id)

    user = f"""你【{player.name}】(猎人) 被 {reason} 杀死了！
{f'你的性格：{personality}' if personality else ''}
根据猎人技能，你可以开枪带走一名玩家。

存活的其他玩家：
{alive}

请决定是否开枪，以及射击谁。如果不想开枪，设为 null。

请用以下 JSON 格式回复：
{{"shoot": <玩家编号或null>}}"""
    return SYSTEM_PROMPT, user


# ═══════════════════════════════════════════════════════════════
# 白天阶段 —— User Prompt
# ═══════════════════════════════════════════════════════════════

def speech_prompt(player: PlayerState, players: List[PlayerState],
                  day: int, deaths_info: str,
                  speech_history: List[Dict[str, str]],
                  personal_info: str = "", personality: str = "") -> tuple:
    """白天发言

    personal_info: 仅该玩家知道的私密信息（如预言家查验结果）
    严禁包含其他玩家角色信息
    """
    alive = _alive_players_list(players)
    dead = _dead_players_list(players)

    prev_speeches = ""
    if speech_history:
        prev_speeches = "之前的发言记录：\n"
        for s in speech_history:
            prev_speeches += f"  [{s['player_id']}] {s['name']}: {s['content']}\n"

    user = f"""第{day}天 白天讨论阶段

你是【{player.name}】，编号 {player.player_id}，身份是【{player.role.display_name}】。
{f'你的性格：{personality}' if personality else ''}
昨晚的死亡情况：{deaths_info if deaths_info else "平安夜，无人死亡。"}

当前存活玩家：
{alive}

已死亡玩家：
{dead}

{prev_speeches}
{personal_info}

请发表你的看法（50-150字）。你可以分析局势、怀疑某人、为自己辩护等。
注意：你不得在发言中直接暴露自己的角色技能使用细节（如"我昨晚查验了某人"需谨慎表述）。

请用以下 JSON 格式回复：
{{"speech": "<你的发言内容>"}}"""
    return SYSTEM_PROMPT, user


def vote_prompt(player: PlayerState, players: List[PlayerState],
                day: int, speeches: List[Dict[str, str]],
                personal_info: str = "", personality: str = "") -> tuple:
    """投票"""
    alive = _alive_players_list(players, exclude_id=player.player_id)

    speech_summary = ""
    if speeches:
        speech_summary = "今天的发言摘要：\n"
        for s in speeches:
            speech_summary += f"  [{s['player_id']}] {s['name']}: {s['content'][:100]}\n"

    user = f"""第{day}天 投票环节

你是【{player.name}】，编号 {player.player_id}，身份是【{player.role.display_name}】。
{f'你的性格：{personality}' if personality else ''}
你可以投票的玩家：
{alive}

{speech_summary}
{personal_info}

请选择你认为是狼人的玩家进行投票。你不可以投自己。
请用以下 JSON 格式回复（只能选择一个存活玩家的编号）：
{{"vote": <玩家编号>}}"""
    return SYSTEM_PROMPT, user


# ═══════════════════════════════════════════════════════════════
# 私密信息注入（personal_info 片段）
# ═══════════════════════════════════════════════════════════════

def day_announce_prompt(day: int, deaths_info: str) -> str:
    """白天死讯广播（用于日志，非 LLM 调用）"""
    if deaths_info:
        return f"第{day}天早上，昨晚的死亡情况：{deaths_info}"
    return f"第{day}天早上，昨晚是平安夜，没有人死亡。"


def seer_personal_info(known_results: List[Dict]) -> str:
    """预言家的私密信息"""
    if not known_results:
        return ""
    lines = ["【你的查验记录】（仅你可见）"]
    for r in known_results:
        lines.append(f"  - {r['name']}(编号{r['id']}): {'🐺狼人' if r['is_wolf'] else '✅好人'}")
    return "\n".join(lines)


def wolf_personal_info(teammates: List[PlayerState]) -> str:
    """狼人的私密信息"""
    if not teammates:
        return ""
    names = "、".join(t.name for t in teammates)
    return f"【你的狼人队友】（仅狼人可见）：{names}"


def witch_personal_info(killed_name: str, killed_id: int,
                        has_antidote: bool, has_poison: bool) -> str:
    """女巫的私密信息"""
    lines = [f"【女巫私密信息】今晚 {killed_name}(编号{killed_id}) 被狼人杀害。"]
    lines.append(f"  解药: {'可用' if has_antidote else '已用'}")
    lines.append(f"  毒药: {'可用' if has_poison else '已用'}")
    return "\n".join(lines)
