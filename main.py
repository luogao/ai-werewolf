#!/usr/bin/env python3
"""AI 狼人杀 — 主入口

用法:
  python3 main.py                    # 正常运行
  python3 main.py --dry-run          # 快速测试（不调用LLM）
  python3 main.py --verbose          # 实时打印游戏过程
  python3 main.py --seed 42          # 指定随机种子
  python3 main.py --config my.yaml   # 指定配置文件
"""
import argparse
import logging
import sys
import os
import yaml

from models import PlayerConfig
from game import GameEngine
from report import generate_report, save_report


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_player_configs(cfg: dict) -> list:
    """从配置文件构建玩家列表"""
    configs = []
    for key in sorted(cfg["models"].keys()):
        p = cfg["models"][key]
        pid = int(key.split("_")[-1])
        configs.append(PlayerConfig(
            player_id=pid,
            model=p["model"],
            name=p["name"],
            personality=p.get("personality", ""),
        ))
    return configs


def main():
    parser = argparse.ArgumentParser(description="AI 狼人杀")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径")
    parser.add_argument("--seed", type=int, default=None, help="随机种子")
    parser.add_argument("--verbose", action="store_true", help="实时打印游戏过程")
    parser.add_argument("--dry-run", action="store_true", help="快速测试模式（不调用LLM）")
    args = parser.parse_args()

    # 日志配置
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(message)s",
    )

    config_path = args.config
    if not os.path.exists(config_path):
        print(f"❌ 配置文件不存在: {config_path}")
        sys.exit(1)

    cfg = load_config(config_path)
    player_configs = build_player_configs(cfg)

    if len(player_configs) != cfg["game"]["total_players"]:
        print(f"❌ 玩家数量({len(player_configs)}) != 配置({cfg['game']['total_players']})")
        sys.exit(1)

    llm_cfg = cfg.get("llm", {})
    reports_dir = cfg.get("output", {}).get("reports_dir", "reports")

    print(f"🐺 AI 狼人杀")
    print(f"   模式: {'DRY-RUN（测试）' if args.dry_run else '实战'}")
    print(f"   玩家: {len(player_configs)} 人")
    print(f"   种子: {args.seed or '随机'}")
    print()

    engine = GameEngine(
        player_configs=player_configs,
        seed=args.seed,
        verbose=args.verbose,
        dry_run=args.dry_run,
        llm_config=llm_cfg,
    )

    game_log = engine.run()

    # 生成战报
    report = generate_report(game_log)
    report_path = save_report(report, reports_dir)

    print()
    print("=" * 60)
    print(report)
    print("=" * 60)
    print(f"\n📄 战报已保存: {report_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
