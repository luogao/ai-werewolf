/**
 * AIPlayer —— Vercel AI SDK 封装，对应原 Python 版 player.py:AIPlayer
 *
 * 提供：
 *   - chat(): 调用 LLM 返回原始文本
 *   - dry-run 模式：返回模拟响应，不消耗 token
 *   - 重试：失败时按指数退避重试
 *   - 指标采集：记录 tokens 用量、响应耗时（供后续统计）
 */
import { generateText, type LanguageModel } from 'ai';
import type { PlayerState, LlmUsage } from '../types';
import { getModel } from './providers';
import { dryRunResponse } from './dryRun';

export interface ChatResult {
  text: string;
  usage: LlmUsage | null;
}

export interface AIPlayerConfig {
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export class AIPlayer {
  readonly state: PlayerState;
  readonly maxRetries: number;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  /** 最近一次调用的指标，phase 层读取后清零 */
  lastUsage: LlmUsage | null = null;

  constructor(state: PlayerState, config: AIPlayerConfig = {}) {
    this.state = state;
    this.maxRetries = config.maxRetries ?? 3;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 512;
    this.dryRun = config.dryRun ?? false;
    this.verbose = config.verbose ?? false;
  }

  get id(): number {
    return this.state.playerId;
  }

  get name(): string {
    return this.state.name;
  }

  get role() {
    return this.state.role;
  }

  get alive(): boolean {
    return this.state.alive;
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const result = await this.chatWithUsage(systemPrompt, userPrompt);
    return result.text;
  }

  async chatWithUsage(systemPrompt: string, userPrompt: string): Promise<ChatResult> {
    if (this.dryRun) {
      const text = dryRunResponse(userPrompt);
      const usage: LlmUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        model: `${this.state.model} (dry-run)`,
      };
      this.lastUsage = usage;
      return { text, usage };
    }

    let model: LanguageModel;
    try {
      model = getModel(this.state.model);
    } catch (e) {
      console.error(`[${this.name}] 无法解析模型 ${this.state.model}: ${(e as Error).message}`);
      this.lastUsage = null;
      return { text: '', usage: null };
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const start = Date.now();
      try {
        const { text, usage } = await generateText({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
        });
        const durationMs = Date.now() - start;

        const promptTokens = usage?.inputTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? 0;
        const llmUsage: LlmUsage = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          durationMs,
          model: this.state.model,
        };
        this.lastUsage = llmUsage;

        if (this.verbose) {
          console.info(
            `[${this.name}] LLM 响应 (attempt ${attempt}, ${durationMs}ms, ${llmUsage.totalTokens} tokens): ${text.slice(0, 200)}`,
          );
        }
        return { text, usage: llmUsage };
      } catch (e) {
        const err = e as Error;
        lastError = err;
        console.warn(
          `[${this.name}] LLM 调用失败 (attempt ${attempt}/${this.maxRetries}): ${err.message}`,
        );
        // 指数退避
        if (attempt < this.maxRetries) {
          const delay = 500 * 2 ** (attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    console.error(`[${this.name}] LLM 调用最终失败: ${lastError?.message ?? 'unknown'}`);
    this.lastUsage = null;
    return { text: '', usage: null };
  }

  toString(): string {
    const status = this.alive ? '存活' : '死亡';
    const role = this.state.role;
    return `Player(${this.id}|${this.name}|${role}|${status})`;
  }
}
