/**
 * 模型注册表 —— 把 modelId 字符串映射到 Vercel AI SDK provider 实例
 *
 * 支持的前缀：
 *   - gpt-* / o1-* / o3-*  → OpenAI
 *   - claude-*              → Anthropic
 *   - deepseek/* / deepseek-* → DeepSeek
 *   - openrouter/*          → OpenRouter（走 OpenAI 兼容协议）
 *   - ollama/*              → Ollama 本地（走 OpenAI 兼容协议）
 */
import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';

const openrouter = createOpenAI({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

const ollamaBaseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const ollama = createOpenAI({
  name: 'ollama',
  baseURL: ollamaBaseURL,
  apiKey: 'ollama', // Ollama 不需要真 key，但 SDK 强制要求字段
});

export interface ProviderInfo {
  id: string;
  label: string;
  docsUrl: string;
  /** 典型模型 ID 列表，仅供 UI 下拉提示 */
  sampleModels: string[];
  envVar?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    docsUrl: 'https://platform.openai.com/docs/models',
    sampleModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'gpt-4.1'],
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
    sampleModels: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    docsUrl: 'https://api-docs.deepseek.com/',
    sampleModels: ['deepseek-chat', 'deepseek-reasoner'],
    envVar: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    docsUrl: 'https://openrouter.ai/models',
    sampleModels: ['openrouter/qwen/qwen-2.5-72b-instruct', 'openrouter/meta-llama/llama-3.1-70b-instruct'],
    envVar: 'OPENROUTER_API_KEY',
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    docsUrl: 'https://ollama.com/library',
    sampleModels: ['ollama/qwen3:8b', 'ollama/llama3.2', 'ollama/phi4'],
  },
];

/**
 * 把配置中的 modelId 解析成 LanguageModel 实例。
 * 抛错时给出明确的修复提示。
 */
export function getModel(modelId: string): LanguageModel {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return openai(modelId);
  }
  if (modelId.startsWith('claude')) {
    return anthropic(modelId);
  }
  if (modelId.startsWith('deepseek')) {
    // 兼容 'deepseek/deepseek-chat' 和 'deepseek-chat' 两种写法
    const id = modelId.startsWith('deepseek/') ? modelId.slice('deepseek/'.length) : modelId;
    return deepseek(id);
  }
  if (modelId.startsWith('openrouter/')) {
    return openrouter(modelId.slice('openrouter/'.length));
  }
  if (modelId.startsWith('ollama/')) {
    return ollama(modelId.slice('ollama/'.length));
  }
  throw new Error(
    `Unknown model: ${modelId}. ` +
      `Supported prefixes: gpt-*, claude-*, deepseek-*, openrouter/*, ollama/*`,
  );
}

export function inferProviderId(modelId: string): string {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) {
    return 'openai';
  }
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('deepseek')) return 'deepseek';
  if (modelId.startsWith('openrouter/')) return 'openrouter';
  if (modelId.startsWith('ollama/')) return 'ollama';
  return 'unknown';
}
