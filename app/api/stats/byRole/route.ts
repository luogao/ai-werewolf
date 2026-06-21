/**
 * GET /api/stats/byRole   按 (model, role) 聚合的胜率
 *
 * 返回每个 (model, role) 组合的局数 + 胜数。
 * 热力图用：行=model，列=role，颜色=胜率。
 */
import { NextResponse } from 'next/server';
import * as db from '@/lib/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = db.getModelRoleStats();
  return NextResponse.json({ stats });
}
