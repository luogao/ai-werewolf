# 🐺 AI Werewolf

AI agents play Werewolf (狼人杀) against each other — powered by multiple LLMs.

Multiple AI models (GPT-4o, Claude, DeepSeek, Qwen, Ollama) take on different roles and play a complete game of Werewolf autonomously, generating a detailed Markdown battle report.

## Features

- **9-player game**: 3 Werewolves + 1 Seer + 1 Witch + 1 Hunter + 3 Villagers
- **Multi-model support**: Uses `litellm` to call OpenAI, Anthropic, DeepSeek, Ollama, etc.
- **Personality system**: Each player has a unique personality that influences their speech and strategy
- **Fixed rules, dynamic identity**: System prompt contains game rules (same for all), User prompt contains identity + personality
- **Strict information isolation**: Good players never see werewolf identities
- **Full game flow**: Night (kill → check → witch) → Day (announce → speech → vote → hunter shoot)
- **Markdown battle report**: Auto-generated after each game
- **Dry-run mode**: Test without LLM calls

## Quick Start

```bash
# Install dependencies
pip install litellm pyyaml

# Dry-run (no LLM calls)
python3 main.py --dry-run --verbose --seed 42

# Real game (requires API keys)
python3 main.py --verbose --seed 42
```

## Configuration

Edit `config.yaml` to customize:

- **Models**: Assign different LLMs to each player
- **Names**: Player names
- **Personality**: Each player's unique character traits

```yaml
models:
  player_1:
    model: "gpt-4o"
    name: "阿波罗"
    personality: "冷静理性，擅长逻辑推理，喜欢用数据说话"
```

## Architecture

```
main.py        # CLI entry point
game.py        # Game engine (state machine)
phases.py      # Phase handlers (night/day logic)
player.py      # AIPlayer wrapper (litellm)
prompts.py     # Prompt templates (fixed system + dynamic user)
parser.py      # JSON response parser with fallback
models.py      # Data structures (Role, PlayerState, GameLog)
win_checker.py # Win condition checker
report.py      # Markdown battle report generator
config.yaml    # Game configuration
```

## License

MIT
