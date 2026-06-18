/**
 * SQLite 连接 + Drizzle 客户端
 *
 * - 使用 better-sqlite3（同步 API，性能好，无 promise 开销）
 * - 单例：模块级缓存，避免 Next.js 热重载多次打开连接
 * - 首次连接时执行 SCHEMA_DDL，自动建表
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_URL ?? './data/werewolf.db';

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _raw: Database.Database | null = null;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  _raw = openRaw();
  _db = drizzle(_raw, { schema });
  // 首次连接时建表 + 加载扩展（如果需要）
  _raw.exec(schema.SCHEMA_DDL);
  // WAL 模式提升并发读写
  _raw.pragma('journal_mode = WAL');
  _raw.pragma('foreign_keys = ON');
  return _db;
}

export function getRaw(): Database.Database {
  if (!_raw) {
    getDb();
  }
  return _raw!;
}

function openRaw(): Database.Database {
  // 解析相对路径
  const resolved = path.resolve(process.cwd(), DB_PATH);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const conn = new Database(resolved);
  return conn;
}

/** 关闭连接（主要用于测试） */
export function closeDb(): void {
  if (_raw) {
    _raw.close();
    _raw = null;
    _db = null;
  }
}
