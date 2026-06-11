"""LLM 返回解析 + 容错处理

最多重试 3 次，支持：
- JSON 格式（直接解析）
- markdown code block 包裹的 JSON
- 纯文本中提取数字
"""
from __future__ import annotations
import json
import re
import logging
from typing import Any, Dict, Optional, List

logger = logging.getLogger("ai-werewolf")


def parse_json_response(text: str) -> Optional[Dict[str, Any]]:
    """从 LLM 响应中提取 JSON dict，支持多种格式容错"""
    if not text:
        return None

    # 尝试1: 直接解析整个响应
    result = _try_parse_json(text)
    if result and isinstance(result, dict):
        return result

    # 尝试2: 提取 ```json ... ``` code block
    result = _extract_code_block(text)
    if result and isinstance(result, dict):
        return result

    # 尝试3: 找最外层的 { ... }
    result = _extract_braces(text)
    if result and isinstance(result, dict):
        return result

    # 尝试4: 修复常见错误（单引号、缺少引号等）
    result = _try_fix_and_parse(text)
    if result and isinstance(result, dict):
        return result

    logger.warning(f"无法解析 JSON 响应: {text[:200]}")
    return None


def parse_action(text: str, field: str,
                 valid_ids: List[int], default: Optional[int] = None) -> Optional[int]:
    """从响应中提取某个字段对应的玩家ID

    Args:
        text: LLM 原始响应
        field: 字段名 (kill, check, vote, shoot, poison)
        valid_ids: 合法的玩家ID列表
        default: 解析失败时的默认值
    """
    parsed = parse_json_response(text)
    if parsed:
        val = parsed.get(field)
        if val is not None:
            int_val = _to_int(val)
            if int_val is not None and int_val in valid_ids:
                return int_val

    # 兜底: 从文本中直接提取数字
    int_val = _extract_number_from_text(text, valid_ids)
    if int_val is not None:
        return int_val

    logger.warning(f"无法从响应中提取有效 {field}: {text[:200]}")
    return default


def parse_speech(text: str) -> str:
    """提取发言内容"""
    parsed = parse_json_response(text)
    if parsed and "speech" in parsed:
        return str(parsed["speech"])

    # 如果不是 JSON 格式，直接返回原文（去掉可能的 markdown 标记）
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return cleaned


def parse_witch_action(text: str) -> Dict[str, Any]:
    """解析女巫行动"""
    parsed = parse_json_response(text)
    if parsed:
        return {
            "save": bool(parsed.get("save", False)),
            "poison": _to_int(parsed.get("poison")),
        }

    # 容错: 从文本推断
    save = False
    poison = None
    if "救" in text or "使用解药" in text:
        save = True
    if "毒" in text:
        nums = re.findall(r'\d+', text)
        if nums:
            poison = int(nums[0])
    return {"save": save, "poison": poison}


def parse_bool_action(text: str, field: str) -> bool:
    """解析布尔型行动"""
    parsed = parse_json_response(text)
    if parsed:
        val = parsed.get(field)
        if val is not None:
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                return val.lower() in ("true", "yes", "是", "1")
            return bool(val)
    return False


# ─── 内部辅助 ───

def _try_parse_json(text: str) -> Optional[Any]:
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return None


def _extract_code_block(text: str) -> Optional[Any]:
    """提取 ```json ... ``` 或 ``` ... ``` 中的内容"""
    patterns = [
        r'```json\s*\n?(.*?)\n?\s*```',
        r'```\s*\n?(.*?)\n?\s*```',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.DOTALL)
        if m:
            return _try_parse_json(m.group(1))
    return None


def _extract_braces(text: str) -> Optional[Any]:
    """提取最外层 { ... }"""
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                candidate = text[start:i + 1]
                result = _try_parse_json(candidate)
                if result is not None:
                    return result
                # 尝试修复
                result = _try_fix_and_parse(candidate)
                if result is not None:
                    return result
    return None


def _try_fix_and_parse(text: str) -> Optional[Any]:
    """修复常见 JSON 错误"""
    # 替换单引号为双引号
    fixed = text.replace("'", '"')
    # 修复没有引号的 key
    fixed = re.sub(r'(\{|,)\s*(\w+)\s*:', r'\1"\2":', fixed)
    # 修复 trailing comma
    fixed = re.sub(r',\s*}', '}', fixed)
    fixed = re.sub(r',\s*\]', ']', fixed)
    # 修复 Python bool
    fixed = fixed.replace("True", "true").replace("False", "false")
    fixed = fixed.replace("None", "null")
    try:
        return json.loads(fixed)
    except (json.JSONDecodeError, ValueError):
        return None


def _to_int(val: Any) -> Optional[int]:
    """将各种格式的值转为 int"""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float) and val.is_integer():
        return int(val)
    if isinstance(val, str):
        m = re.search(r'\d+', val)
        if m:
            return int(m.group())
    return None


def _extract_number_from_text(text: str, valid_ids: List[int]) -> Optional[int]:
    """从纯文本中提取合法的玩家 ID"""
    nums = re.findall(r'\b(\d+)\b', text)
    for n_str in reversed(nums):  # 取最后一个数字（通常是最终答案）
        n = int(n_str)
        if n in valid_ids:
            return n
    return None
