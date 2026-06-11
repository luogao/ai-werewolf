"""AI玩家 - 通过 litellm 调用 LLM"""
from __future__ import annotations
import json
import logging
from typing import Dict, Any, Optional
from litellm import completion
from models import PlayerState, Role

logger = logging.getLogger("ai-werewolf")


class AIPlayer:
    """封装 LLM 调用的玩家"""

    def __init__(self, state: PlayerState, max_retries: int = 3,
                 temperature: float = 0.7, max_tokens: int = 512,
                 dry_run: bool = False):
        self.state = state
        self.max_retries = max_retries
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.dry_run = dry_run

    @property
    def id(self) -> int:
        return self.state.player_id

    @property
    def name(self) -> str:
        return self.state.name

    @property
    def role(self) -> Role:
        return self.state.role

    @property
    def alive(self) -> bool:
        return self.state.alive

    def chat(self, system_prompt: str, user_prompt: str,
             verbose: bool = False) -> str:
        """调用 LLM，返回原始文本响应"""
        if self.dry_run:
            return self._dry_run_response(system_prompt, user_prompt)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        for attempt in range(1, self.max_retries + 1):
            try:
                resp = completion(
                    model=self.state.model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    timeout=60,
                )
                text = resp.choices[0].message.content.strip()
                if verbose:
                    logger.info(f"[{self.name}] LLM响应 (attempt {attempt}): {text[:200]}")
                return text
            except Exception as e:
                logger.warning(
                    f"[{self.name}] LLM调用失败 (attempt {attempt}/{self.max_retries}): {e}"
                )
                if attempt == self.max_retries:
                    logger.error(f"[{self.name}] LLM调用最终失败，返回空响应")
                    return ""
        return ""

    def chat_json(self, system_prompt: str, user_prompt: str,
                  verbose: bool = False) -> Optional[Dict[str, Any]]:
        """调用 LLM 并期望返回 JSON"""
        text = self.chat(system_prompt, user_prompt, verbose)
        if not text:
            return None
        return text  # 解析交给 parser

    def _dry_run_response(self, system_prompt: str, user_prompt: str) -> str:
        """dry-run 模式下返回模拟响应"""
        import random

        # 提取可选的合法ID
        valid_ids = []
        for m in __import__('re').finditer(r'\[(\d+)\]', user_prompt):
            valid_ids.append(int(m.group(1)))

        # 优先判断发言和投票（这些prompt也可能包含"狼人"等关键词）
        if "发言" in user_prompt or "speech" in user_prompt.lower():
            speeches = [
                "我觉得昨晚的死讯很蹊跷，需要仔细分析一下每个人的表现。",
                "我是好人，请大家相信我。我建议大家关注一下发言异常的人。",
                "有没有人要跳预言家？我觉得现在应该分享一些信息了。",
                "我观察了一下，有些人的发言比较模糊，可能是在隐藏什么。",
                "昨晚的死亡顺序值得深思，我觉得狼人可能在故意引导方向。",
                "根据我的分析，目前局势比较复杂，我们需要谨慎投票。",
            ]
            return json.dumps({"speech": random.choice(speeches)}, ensure_ascii=False)
        elif "投票" in user_prompt or "vote" in user_prompt.lower():
            # 排除自己
            my_id_match = __import__('re').search(r'编号\s*(\d+)', user_prompt)
            my_id = int(my_id_match.group(1)) if my_id_match else 0
            choices = [x for x in valid_ids if x != my_id] or [1]
            return json.dumps({"vote": random.choice(choices)}, ensure_ascii=False)
        elif "狼人" in user_prompt and "杀" in user_prompt:
            choices = valid_ids or [1]
            return json.dumps({"kill": random.choice(choices)}, ensure_ascii=False)
        elif "查验" in user_prompt:
            choices = valid_ids or [2]
            return json.dumps({"check": random.choice(choices)}, ensure_ascii=False)
        elif "女巫" in user_prompt:
            return json.dumps({"save": random.random() > 0.5, "poison": None}, ensure_ascii=False)
        elif "猎人" in user_prompt and ("开枪" in user_prompt or "射击" in user_prompt):
            choices = valid_ids or [1]
            return json.dumps({"shoot": random.choice(choices)}, ensure_ascii=False)
        else:
            return json.dumps({"action": "pass"}, ensure_ascii=False)

    def __repr__(self) -> str:
        status = "存活" if self.alive else "死亡"
        return f"Player({self.id}|{self.name}|{self.role.display_name}|{status})"
