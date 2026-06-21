import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'AI 狼人杀',
  description: '多模型 AI 玩狼人杀，实时直播 + 回放 + 统计',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
