"""角色、状态等数据结构定义"""
from __future__ import annotations
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


class Role(Enum):
    WEREWOLF = "werewolf"
    SEER = "seer"
    WITCH = "witch"
    HUNTER = "hunter"
    VILLAGER = "villager"

    @property
    def display_name(self) -> str:
        names = {
            "werewolf": "狼人",
            "seer": "预言家",
            "witch": "女巫",
            "hunter": "猎人",
            "villager": "村民",
        }
        return names[self.value]

    @property
    def faction(self) -> str:
        return "wolf" if self == Role.WEREWOLF else "good"


class Phase(Enum):
    SETUP = "setup"
    NIGHT_START = "night_start"
    WOLF_KILL = "wolf_kill"          # 狼人杀人
    SEER_CHECK = "seer_check"        # 预言家查验
    WITCH_SAVE = "witch_save"        # 女巫救/毒
    NIGHT_END = "night_end"
    DAY_ANNOUNCE = "day_announce"    # 白天宣布死讯
    HUNTER_SHOOT = "hunter_shoot"    # 猎人开枪（若被杀）
    SPEECH = "speech"                # 发言
    VOTE = "vote"                    # 投票
    VOTE_RESULT = "vote_result"      # 投票结果
    GAME_OVER = "game_over"


class DeathReason(Enum):
    WOLF_KILL = "wolf_kill"
    WITCH_POISON = "witch_poison"
    VOTE_OUT = "vote_out"
    HUNTER_SHOOT = "hunter_shoot"


@dataclass
class DeathRecord:
    player_id: int
    reason: DeathReason
    day: int
    details: str = ""


@dataclass
class PlayerConfig:
    player_id: int
    model: str
    name: str
    personality: str = ""


@dataclass
class PlayerState:
    player_id: int
    name: str
    model: str
    role: Role
    personality: str = ""          # 玩家人格/风格描述
    alive: bool = True
    # 女巫状态
    witch_has_antidote: bool = False
    witch_has_poison: bool = False
    # 猎人状态
    hunter_can_shoot: bool = False
    # 记忆/历史
    speech_history: List[Dict[str, Any]] = field(default_factory=list)
    vote_history: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def faction(self) -> str:
        return self.role.faction

    def to_dict(self) -> Dict[str, Any]:
        return {
            "player_id": self.player_id,
            "name": self.name,
            "role": self.role.display_name,
            "alive": self.alive,
        }


@dataclass
class NightAction:
    """夜晚行动记录"""
    day: int
    wolf_target: Optional[int] = None        # 狼人杀谁
    seer_target: Optional[int] = None         # 预言家查谁
    seer_result: Optional[str] = None         # 好人/狼人
    witch_saved: bool = False                 # 女巫是否救人
    witch_poisoned: Optional[int] = None      # 女巫毒谁
    deaths: List[DeathRecord] = field(default_factory=list)


@dataclass
class VoteResult:
    day: int
    votes: Dict[int, int] = field(default_factory=dict)   # voter -> target
    tally: Dict[int, int] = field(default_factory=dict)    # target -> count
    eliminated: Optional[int] = None
    is_tie: bool = False


@dataclass
class GameLog:
    """整局游戏日志"""
    players: List[PlayerState]
    day: int = 0
    phase: Phase = Phase.SETUP
    nights: List[NightAction] = field(default_factory=list)
    votes: List[VoteResult] = field(default_factory=list)
    deaths: List[DeathRecord] = field(default_factory=list)
    speeches: List[List[Dict[str, str]]] = field(default_factory=list)  # 每天的发言
    winner: Optional[str] = None
    winner_reason: str = ""
    seed: Optional[int] = None
