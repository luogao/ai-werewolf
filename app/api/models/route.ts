/**
 * GET /api/models  返回支持的 provider 列表，供 UI 下拉
 */
import { NextResponse } from 'next/server';
import { PROVIDERS } from '@/lib/llm/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ providers: PROVIDERS });
}
