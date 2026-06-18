/**
 * LLM 响应解析 + 容错 —— 对应原 Python 版 parser.py
 *
 * 最多支持 4 层容错：
 * 1. 直接 JSON.parse
 * 2. 提取 ```json ... ``` code block
 * 3. 提取最外层 { ... }
 * 4. 修复常见错误后重试
 * 5. 从纯文本中提取数字兜底
 */

export interface ParsedObject {
  [key: string]: unknown;
}

export function parseJsonResponse(text: string): ParsedObject | null {
  if (!text) return null;

  // 尝试1: 直接解析
  const direct = tryParseJson(text);
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as ParsedObject;
  }

  // 尝试2: 提取 code block
  const fromBlock = extractCodeBlock(text);
  if (fromBlock && typeof fromBlock === 'object' && !Array.isArray(fromBlock)) {
    return fromBlock as ParsedObject;
  }

  // 尝试3: 提取最外层 { ... }
  const fromBraces = extractBraces(text);
  if (fromBraces && typeof fromBraces === 'object' && !Array.isArray(fromBraces)) {
    return fromBraces as ParsedObject;
  }

  // 尝试4: 修复后解析
  const fixed = tryFixAndParse(text);
  if (fixed && typeof fixed === 'object' && !Array.isArray(fixed)) {
    return fixed as ParsedObject;
  }

  return null;
}

export function parseAction(
  text: string,
  field: string,
  validIds: number[],
  defaultValue: number | null = null,
): number | null {
  const parsed = parseJsonResponse(text);
  if (parsed) {
    const val = parsed[field];
    if (val !== undefined && val !== null) {
      const intVal = toInt(val);
      if (intVal !== null && validIds.includes(intVal)) {
        return intVal;
      }
    }
  }

  // 兜底: 从文本中提取合法 ID
  const num = extractNumberFromText(text, validIds);
  if (num !== null) return num;

  return defaultValue;
}

export function parseSpeech(text: string): string {
  const parsed = parseJsonResponse(text);
  if (parsed && typeof parsed.speech === 'string') {
    return parsed.speech;
  }

  // 非 JSON 时直接返回原文，去掉 markdown 标记
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    const isClosed = lines[lines.length - 1].trim() === '```';
    cleaned = lines.slice(1, isClosed ? -1 : undefined).join('\n');
  }
  return cleaned;
}

export interface WitchAction {
  save: boolean;
  poison: number | null;
}

export function parseWitchAction(text: string): WitchAction {
  const parsed = parseJsonResponse(text);
  if (parsed) {
    return {
      save: Boolean(parsed.save ?? false),
      poison: toInt(parsed.poison ?? null),
    };
  }

  // 容错: 从文本推断
  let save = false;
  let poison: number | null = null;
  if (text.includes('救') || text.includes('使用解药')) {
    save = true;
  }
  if (text.includes('毒')) {
    const nums = text.match(/\d+/g);
    if (nums && nums.length) {
      poison = parseInt(nums[0], 10);
    }
  }
  return { save, poison };
}

export function parseBoolAction(text: string, field: string): boolean {
  const parsed = parseJsonResponse(text);
  if (parsed) {
    const val = parsed[field];
    if (val !== undefined && val !== null) {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        return ['true', 'yes', '是', '1'].includes(val.toLowerCase());
      }
      return Boolean(val);
    }
  }
  return false;
}

// ─── 内部辅助 ──────────────────────────────────────────────────

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

function extractCodeBlock(text: string): unknown {
  const patterns = [
    /```json\s*\n?([\s\S]*?)\n?\s*```/,
    /```\s*\n?([\s\S]*?)\n?\s*```/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const result = tryParseJson(m[1]);
      if (result !== null) return result;
      const fixed = tryFixAndParse(m[1]);
      if (fixed !== null) return fixed;
    }
  }
  return null;
}

function extractBraces(text: string): unknown {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        const result = tryParseJson(candidate);
        if (result !== null) return result;
        const fixed = tryFixAndParse(candidate);
        if (fixed !== null) return fixed;
      }
    }
  }
  return null;
}

function tryFixAndParse(text: string): unknown {
  let fixed = text.replace(/'/g, '"');
  // 给无引号的 key 加引号
  fixed = fixed.replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');
  // 修复 trailing comma
  fixed = fixed.replace(/,\s*}/g, '}');
  fixed = fixed.replace(/,\s*]/g, ']');
  // 修复 Python bool
  fixed = fixed.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
  fixed = fixed.replace(/\bNone\b/g, 'null');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : null;
  }
  if (typeof val === 'string') {
    const m = val.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

function extractNumberFromText(text: string, validIds: number[]): number | null {
  const matches = text.match(/\b(\d+)\b/g);
  if (!matches) return null;
  // 取最后一个匹配的合法 ID（通常是最终答案）
  for (let i = matches.length - 1; i >= 0; i--) {
    const n = parseInt(matches[i], 10);
    if (validIds.includes(n)) return n;
  }
  return null;
}
