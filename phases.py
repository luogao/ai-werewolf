"""各阶段处理逻辑

阶段流程：
  NIGHT → wolf_kill → seer_check → witch_action → NIGHT_END
  DAY   → day_announce → hunter_shoot(若触发) → speech → vote → vote_result
"""
from __future__ import annotations
import logging
import random
from typing import List, Optional, Dict, Any, TYPE_CHECKING

from models import (
    PlayerState, Role, NightAction, DeathRecord, DeathReason, Phase
)
from player import AIPlayer
from parser import parse_action, parse_speech, parse_witch_action
import prompts

if TYPE_CHECKING:
    from game import GameEngine

logger = logging.getLogger("ai-werewolf")


# ─── 夜晚阶段 ───

def phase_wolf_kill(engine: "GameEngine") -> None:
    """狼人商量杀人"""
    log = engine.log
    day = log.day
    night = NightAction(day=day)

    wolves = [p for p in engine.players if p.alive and p.role == Role.WEREWOLF]
    if not wolves:
        log.nights.append(night)
        return

    alive_ids = [p.state.player_id for p in engine.players if p.alive and p.role != Role.WEREWOLF]
    if not alive_ids:
        log.nights.append(night)
        return

    night_history = [
        {"day": n.day, "deaths": [{"name": engine.get_player_name(d.player_id)} for d in n.deaths]}
        for n in log.nights
    ]

    # 每个狼人独立投票
    votes: Dict[int, int] = {}
    for wolf in wolves:
        sys_p, user_p = prompts.wolf_kill_prompt(
            wolf.state, [p.state for p in engine.players], night_history,
            personality=wolf.state.personality,
        )
        raw = wolf.chat(sys_p, user_p, verbose=engine.verbose)
        target = parse_action(raw, "kill", alive_ids)

        # dry-run fallback: 随机选一个合法目标
        if target is None and engine.dry_run and alive_ids:
            target = random.choice(alive_ids)

        if target is not None:
            votes[wolf.id] = target

        if engine.verbose:
            logger.info(f"  🐺 {wolf.name} 选择杀: {target}")

    # 多数决（平局随机选）
    if votes:
        tally: Dict[int, int] = {}
        for t in votes.values():
            tally[t] = tally.get(t, 0) + 1
        max_count = max(tally.values())
        candidates = [t for t, c in tally.items() if c == max_count]
        night.wolf_target = random.choice(candidates)
    else:
        night.wolf_target = random.choice(alive_ids)

    if engine.verbose:
        name = engine.get_player_name(night.wolf_target)
        logger.info(f"  🌙 第{day}夜 狼人决定杀害: {name}({night.wolf_target})")

    engine.current_night = night


def phase_seer_check(engine: "GameEngine") -> None:
    """预言家查验"""
    night = engine.current_night
    if not night:
        return

    seer = _find_alive_player(engine, Role.SEER)
    if not seer:
        return

    alive_ids = [p.state.player_id for p in engine.players
                 if p.alive and p.state.player_id != seer.id]

    sys_p, user_p = prompts.seer_check_prompt(
        seer.state, [p.state for p in engine.players],
        engine.seer_results, [],
        personality=seer.state.personality,
    )
    raw = seer.chat(sys_p, user_p, verbose=engine.verbose)
    target = parse_action(raw, "check", alive_ids)

    # dry-run fallback
    if target is None and engine.dry_run and alive_ids:
        target = random.choice(alive_ids)

    if target is not None:
        night.seer_target = target
        target_player = engine.get_player_by_id(target)
        is_wolf = target_player.role == Role.WEREWOLF
        night.seer_result = "狼人" if is_wolf else "好人"

        engine.seer_results.append({
            "id": target,
            "name": target_player.name,
            "is_wolf": is_wolf,
        })

        if engine.verbose:
            logger.info(
                f"  🔮 预言家{seer.name}查验: {target_player.name}({target}) → {night.seer_result}"
            )


def phase_witch_action(engine: "GameEngine") -> None:
    """女巫行动（救/毒）"""
    night = engine.current_night
    if not night:
        return

    witch = _find_alive_player(engine, Role.WITCH)
    if not witch:
        return

    has_antidote = witch.state.witch_has_antidote
    has_poison = witch.state.witch_has_poison

    if not has_antidote and not has_poison:
        return

    killed_name = engine.get_player_name(night.wolf_target) if night.wolf_target else "未知"
    killed_id = night.wolf_target if night.wolf_target else -1

    sys_p, user_p = prompts.witch_action_prompt(
        witch.state, [p.state for p in engine.players],
        killed_name, killed_id, has_antidote, has_poison, [],
        personality=witch.state.personality,
    )
    raw = witch.chat(sys_p, user_p, verbose=engine.verbose)
    action = parse_witch_action(raw)

    # 救人
    if action["save"] and has_antidote and night.wolf_target:
        night.witch_saved = True
        witch.state.witch_has_antidote = False
        if engine.verbose:
            logger.info(f"  💊 女巫{witch.name}使用解药救了 {killed_name}")

    # 毒人
    alive_ids = [p.state.player_id for p in engine.players
                 if p.alive and p.state.player_id != witch.id]
    poison_target = action.get("poison")
    if poison_target and has_poison:
        poison_id = _to_int_safe(poison_target)
        if poison_id is not None and poison_id in alive_ids:
            night.witch_poisoned = poison_id
            witch.state.witch_has_poison = False
            if engine.verbose:
                poison_name = engine.get_player_name(poison_id)
                logger.info(f"  ☠️ 女巫{witch.name}使用毒药毒了 {poison_name}")


def phase_night_resolve(engine: "GameEngine") -> List[DeathRecord]:
    """结算夜晚死亡"""
    night = engine.current_night
    if not night:
        return []

    deaths = []

    # 狼人杀人（除非被女巫救）
    if night.wolf_target and not night.witch_saved:
        target = engine.get_player_by_id(night.wolf_target)
        if target and target.alive:
            target.alive = False
            death = DeathRecord(
                player_id=night.wolf_target,
                reason=DeathReason.WOLF_KILL,
                day=night.day,
                details=f"被狼人杀害",
            )
            deaths.append(death)

    # 女巫毒杀
    if night.witch_poisoned:
        target = engine.get_player_by_id(night.witch_poisoned)
        if target and target.alive:
            target.alive = False
            death = DeathRecord(
                player_id=night.witch_poisoned,
                reason=DeathReason.WITCH_POISON,
                day=night.day,
                details=f"被女巫毒杀",
            )
            deaths.append(death)

    night.deaths = deaths
    engine.log.nights.append(night)
    engine.log.deaths.extend(deaths)
    return deaths


# ─── 白天阶段 ───

def phase_day_announce(engine: "GameEngine", deaths: List[DeathRecord]) -> str:
    """宣布死讯"""
    if deaths:
        names = "、".join(
            f"{engine.get_player_name(d.player_id)}({d.details})" for d in deaths
        )
        msg = f"昨晚，{names}。"
    else:
        msg = "昨晚是平安夜，没有人死亡。"

    if engine.verbose:
        logger.info(f"  ☀️ {msg}")
    return msg


def phase_hunter_shoot(engine: "GameEngine", deaths: List[DeathRecord]) -> Optional[int]:
    """猎人被杀时开枪"""
    for death in deaths:
        player = engine.get_player_by_id(death.player_id)
        if player and player.role == Role.HUNTER and player.hunter_can_shoot:
            hunter_player = _find_player_by_id(engine, death.player_id)
            if not hunter_player:
                continue

            alive_ids = [p.state.player_id for p in engine.players if p.alive]
            reason_str = death.details

            sys_p, user_p = prompts.hunter_shoot_prompt(
                hunter_player.state, [p.state for p in engine.players],
                reason_str, [],
                personality=hunter_player.state.personality,
            )
            raw = hunter_player.chat(sys_p, user_p, verbose=engine.verbose)
            target = parse_action(raw, "shoot", alive_ids)

            if target is not None:
                target_player = engine.get_player_by_id(target)
                if target_player and target_player.alive:
                    target_player.alive = False
                    shoot_death = DeathRecord(
                        player_id=target,
                        reason=DeathReason.HUNTER_SHOOT,
                        day=engine.log.day,
                        details=f"被猎人{player.name}开枪射杀",
                    )
                    engine.log.deaths.append(shoot_death)
                    if engine.verbose:
                        logger.info(
                            f"  🔫 猎人{player.name}开枪射杀了 {target_player.name}({target})"
                        )
                    return target
    return None


def phase_speech(engine: "GameEngine", day: int, deaths_info: str) -> List[Dict[str, str]]:
    """白天发言阶段"""
    speeches = []
    alive_players = [p for p in engine.players if p.alive]

    for player in alive_players:
        # 构建私密信息（严格信息隔离）
        personal_info = ""
        if player.role == Role.SEER:
            personal_info = prompts.seer_personal_info(engine.seer_results)
        elif player.role == Role.WEREWOLF:
            wolves = [p.state for p in engine.players
                      if p.role == Role.WEREWOLF and p.id != player.id and p.alive]
            personal_info = prompts.wolf_personal_info(wolves)

        sys_p, user_p = prompts.speech_prompt(
            player.state, [p.state for p in engine.players],
            day, deaths_info, speeches, personal_info,
            personality=player.state.personality,
        )
        raw = player.chat(sys_p, user_p, verbose=engine.verbose)
        speech_text = parse_speech(raw)

        speeches.append({
            "player_id": player.id,
            "name": player.name,
            "content": speech_text,
        })

        if engine.verbose:
            logger.info(f"  🎤 [{player.id}] {player.name}: {speech_text[:80]}...")

    engine.log.speeches.append(speeches)
    return speeches


def phase_vote(engine: "GameEngine", day: int,
               speeches: List[Dict[str, str]]) -> "VoteResult":
    """投票阶段"""
    from models import VoteResult

    alive_players = [p for p in engine.players if p.alive]
    alive_ids = [p.state.player_id for p in alive_players]

    votes: Dict[int, int] = {}
    for player in alive_players:
        # 私密信息
        personal_info = ""
        if player.role == Role.SEER:
            personal_info = prompts.seer_personal_info(engine.seer_results)
        elif player.role == Role.WEREWOLF:
            wolves = [p.state for p in engine.players
                      if p.role == Role.WEREWOLF and p.id != player.id and p.alive]
            personal_info = prompts.wolf_personal_info(wolves)

        sys_p, user_p = prompts.vote_prompt(
            player.state, [p.state for p in engine.players],
            day, speeches, personal_info,
            personality=player.state.personality,
        )
        raw = player.chat(sys_p, user_p, verbose=engine.verbose)

        # 不能投自己
        valid_targets = [pid for pid in alive_ids if pid != player.id]
        target = parse_action(raw, "vote", valid_targets)

        # dry-run fallback
        if target is None and engine.dry_run and valid_targets:
            target = random.choice(valid_targets)

        if target is not None:
            votes[player.id] = target

        if engine.verbose:
            target_name = engine.get_player_name(target) if target else "无效"
            logger.info(f"  🗳️ [{player.id}] {player.name} → 投票给 {target_name}")

    # 计票
    tally: Dict[int, int] = {}
    for target in votes.values():
        tally[target] = tally.get(target, 0) + 1

    eliminated = None
    is_tie = False
    if tally:
        max_count = max(tally.values())
        candidates = [t for t, c in tally.items() if c == max_count]
        if len(candidates) == 1:
            eliminated = candidates[0]
        else:
            is_tie = True
            eliminated = random.choice(candidates)  # 平局随机

    # 执行放逐
    if eliminated is not None:
        target_player = engine.get_player_by_id(eliminated)
        if target_player:
            target_player.alive = False
            death = DeathRecord(
                player_id=eliminated,
                reason=DeathReason.VOTE_OUT,
                day=day,
                details=f"被投票放逐({tally.get(eliminated, 0)}票)",
            )
            engine.log.deaths.append(death)

            if engine.verbose:
                name = target_player.name
                logger.info(f"  ⚖️ {name}({eliminated}) 被投票放逐 ({tally.get(eliminated, 0)}票)")

    result = VoteResult(
        day=day, votes=votes, tally=tally,
        eliminated=eliminated, is_tie=is_tie,
    )
    engine.log.votes.append(result)
    return result


# ─── 辅助 ───

def _find_alive_player(engine: "GameEngine", role: Role) -> Optional[AIPlayer]:
    for p in engine.players:
        if p.alive and p.role == role:
            return p
    return None


def _find_player_by_id(engine: "GameEngine", pid: int) -> Optional[AIPlayer]:
    for p in engine.players:
        if p.id == pid:
            return p
    return None


def _to_int_safe(val) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
