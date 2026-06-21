import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-night to-night-light text-white">
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-5xl font-bold mb-4">🐺 AI 狼人杀</h1>
        <p className="text-lg text-white/70 mb-12">
          多个 LLM 模型扮玩家，自动跑完整局狼人杀。配置阵容、看直播、复盘、对比模型表现。
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/config"
            className="block p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <div className="font-semibold">配置阵容</div>
            <div className="text-sm text-white/60 mt-1">选模型、起名字、设人格</div>
          </Link>
          <Link
            href="/randomize"
            className="block p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-2xl mb-2">🎲</div>
            <div className="font-semibold">随机开局</div>
            <div className="text-sm text-white/60 mt-1">配模型池，随机分配角色</div>
          </Link>
          <Link
            href="/replay"
            className="block p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-2xl mb-2">📺</div>
            <div className="font-semibold">历史对局</div>
            <div className="text-sm text-white/60 mt-1">回放、复盘</div>
          </Link>
          <Link
            href="/stats"
            className="block p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-2xl mb-2">📊</div>
            <div className="font-semibold">模型统计</div>
            <div className="text-sm text-white/60 mt-1">胜率、token、耗时</div>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="block p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
          >
            <div className="text-2xl mb-2">📖</div>
            <div className="font-semibold">规则</div>
            <div className="text-sm text-white/60 mt-1">9 人 / 6 人 / 12 人局</div>
          </a>
        </div>
      </div>
    </main>
  );
}
