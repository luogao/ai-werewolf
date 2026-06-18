import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 狼人杀',
  description: '多模型 AI 玩狼人杀，实时直播 + 回放 + 统计',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
