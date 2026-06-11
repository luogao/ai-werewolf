"""GameEngine - 状态机驱动的游戏主循环"""
from __future__ import annotations
import random
import logging
from typing import List, Optional, Dict, Any

from models import (
    PlayerState, Role, PlayerConfig, Phase,
    GameLog, NightAction, DeathRecord, DeathReason,
)
from player import AIPlayer
from win_checker import check_win, game_over_info
import phases
import prompts

logger = logging.getLogger("ai-werewolf")

# 角色分配模板（9人局）
ROLE_TEMPLATE = [
    Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
    Role.SEER,
    Role.WITCH,
    Role.HUNTER,
    Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
]


class GameEngine:
    """游戏引擎 - 管理整个游戏流程"""

    def __init__(self, player_configs: List[PlayerConfig],
                 seed: Optional[int] = None,
                 verbose: bool = False,
                 dry_run: bool = False,
                 llm_config: Optional[Dict] = None):
        self.verbose = verbose
        self.dry_run = dry_run
        self.seed = seed

        if seed is not None:
            random.seed(seed)

        llm_config = llm_config or {}
        max_retries = llm_config.get("max_retries", 3)
        temperature = llm_config.get("temperature", 0.7)
        max_tokens = llm_config.get("max_tokens", 512)

        # 创建玩家
        self.players: List[AIPlayer] = []
        for cfg in player_configs:
            state = PlayerState(
                player_id=cfg.player_id,
                name=cfg.name,
                model=cfg.model,
                role=Role.VILLAGER,  # 临时，之后分配
                personality=cfg.personality,
            )
            player = AIPlayer(
                state=state,
                max_retries=max_retries,
                temperature=temperature,
                max_tokens=max_tokens,
                dry_run=dry_run,
            )
            self.players.append(player)

        self.log = GameLog(players=[p.state for p in self.players], seed=seed)
        self.current_night: Optional[NightAction] = None
        self.seer_results: List[Dict[str, Any]] = []

    def setup(self) -> None:
        """分配角色"""
        roles = list(ROLE_TEMPLATE)
        random.shuffle(roles)

        for player, role in zip(self.players, roles):
            player.state.role = role
            # 女巫初始化药物
            if role == Role.WITCH:
                player.state.witch_has_antidote = True
                player.state.witch_has_poison = True
            # 猎人初始化
            if role == Role.HUNTER:
                player.state.hunter_can_shoot = True

        self.log.phase = Phase.SETUP

        if self.verbose:
            for p in self.players:
                logger.info(f"  角色分配: [{p.id}] {p.name} → {p.role.display_name}")

        # 发送身份提示
        self._send_role_reveals()

    def _send_role_reveals(self) -> None:
        """向每个玩家发送身份信息"""
        for player in self.players:
            teammates = None
            if player.role == Role.WEREWOLF:
                teammates = [
                    p.state for p in self.players
                    if p.role == Role.WEREWOLF and p.id != player.id
                ]
            prompt = prompts.role_reveal_prompt(player.state, teammates, player.state.personality)
            # 不需要 LLM 回复，仅记录
            player.state.speech_history.append({
                "type": "role_reveal",
                "content": prompt,
            })

    def run(self) -> GameLog:
        """运行整局游戏"""
        self.setup()

        max_days = 20  # 安全上限
        for day in range(1, max_days + 1):
            self.log.day = day

            if self.verbose:
                logger.info(f"\n{'='*50}")
                logger.info(f"  第 {day} 天 — 夜晚阶段")
                logger.info(f"{'='*50}")

            # ─── 夜晚 ───
            self.current_night = NightAction(day=day)

            phases.phase_wolf_kill(self)
            phases.phase_seer_check(self)
            phases.phase_witch_action(self)
            deaths = phases.phase_night_resolve(self)

            # 检查胜负
            winner, reason = check_win([p.state for p in self.players])
            if winner:
                self.log.winner = winner
                self.log.winner_reason = reason
                self._log_game_over()
                return self.log

            # ─── 白天 ───
            if self.verbose:
                logger.info(f"\n{'='*50}")
                logger.info(f"  第 {day} 天 — 白天阶段")
                logger.info(f"{'='*50}")

            deaths_info = phases.phase_day_announce(self, deaths)

            # 猎人开枪（夜晚死亡触发）
            if deaths:
                hunter_shot = phases.phase_hunter_shoot(self, deaths)
                if hunter_shot is not None:
                    # 猎人开枪后再次检查胜负
                    winner, reason = check_win([p.state for p in self.players])
                    if winner:
                        self.log.winner = winner
                        self.log.winner_reason = reason
                        self._log_game_over()
                        return self.log

            # 发言
            speeches = phases.phase_speech(self, day, deaths_info)

            # 投票
            vote_result = phases.phase_vote(self, day, speeches)

            # 投票放逐后的猎人开枪
            if vote_result.eliminated is not None:
                elim_player = self.get_player_by_id(vote_result.eliminated)
                if elim_player and elim_player.role == Role.HUNTER:
                    vote_death = DeathRecord(
                        player_id=vote_result.eliminated,
                        reason=DeathReason.VOTE_OUT,
                        day=day,
                    )
                    hunter_shot = phases.phase_hunter_shoot(self, [vote_death])
                    if hunter_shot is not None:
                        winner, reason = check_win([p.state for p in self.players])
                        if winner:
                            self.log.winner = winner
                            self.log.winner_reason = reason
                            self._log_game_over()
                            return self.log

            # 检查胜负
            winner, reason = check_win([p.state for p in self.players])
            if winner:
                self.log.winner = winner
                self.log.winner_reason = reason
                self._log_game_over()
                return self.log

        # 超过最大天数
        self.log.winner = "draw"
        self.log.winner_reason = f"游戏超过 {max_days} 天，判定平局。"
        return self.log

    def _log_game_over(self) -> None:
        self.log.phase = Phase.GAME_OVER
        info = game_over_info(
            [p.state for p in self.players],
            self.log.winner or "",
            self.log.winner_reason,
        )
        if self.verbose:
            logger.info(f"\n{info}")

    # ─── 辅助 ───

    def get_player_by_id(self, pid: int) -> Optional[PlayerState]:
        for p in self.players:
            if p.id == pid:
                return p.state
        return None

    def get_player_name(self, pid: int) -> str:
        p = self.get_player_by_id(pid)
        return p.name if p else f"未知({pid})"
