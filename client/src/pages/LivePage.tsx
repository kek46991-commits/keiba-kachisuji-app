import { useState } from "react";
import { motion } from "framer-motion";
import PageHead from "@/components/PageHead";

// ==========================================
// 無料で視聴できるYouTubeチャンネル一覧
// ==========================================
const LIVE_CHANNELS = [
  {
    id: "jra-official",
    name: "JRA公式チャンネル",
    description: "JRA（日本中央競馬会）公式。G1レースのライブ配信・ハイライト動画を無料公開。",
    channelId: "UCj6AKkCWS6FJqf0o5wP45eQ",
    searchQuery: "JRA 競馬 ライブ",
    icon: "🏆",
    color: "#f59e0b",
    isOfficial: true,
  },
  {
    id: "nar-official",
    name: "NAR地方競馬公式",
    description: "地方競馬（NAR）公式チャンネル。ダートグレード競走・地方競馬情報を配信。",
    channelId: "UCjkOgWcS0111xXkAqyhR5Vw",
    searchQuery: "地方競馬 ライブ NAR",
    icon: "🌙",
    color: "#8b5cf6",
    isOfficial: true,
  },
  {
    id: "tck-official",
    name: "TCK東京シティ競馬公式",
    description: "TCK（大井競馬場）公式。パドック・レースライブ配信。",
    channelId: "UCPSZn8iMXln9o89SpmeJ6wg",
    searchQuery: "TCK 大井競馬 ライブ",
    icon: "🌃",
    color: "#ec4899",
    isOfficial: true,
  },
  {
    id: "keiba-lab",
    name: "競馬ラボ",
    description: "予想・分析・レース解説の人気チャンネル。無料で視聴可能。",
    channelId: "",
    searchQuery: "競馬ラボ 予想",
    icon: "🔬",
    color: "#10b981",
    isOfficial: false,
  },
  {
    id: "uma-musume",
    name: "競馬実況・解説",
    description: "リアルタイム実況・解説動画。レース後すぐにアップロード。",
    channelId: "",
    searchQuery: "競馬 実況 ライブ 今日",
    icon: "🎙️",
    color: "#3b82f6",
    isOfficial: false,
  },
];

// 今日の日付
function getTodayStr(): string {
  const now = new Date();
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${now.getMonth() + 1}月${now.getDate()}日(${days[now.getDay()]})`;
}

// ==========================================
// YouTubeプレーヤーコンポーネント
// ==========================================
function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ border: "none" }}
      />
    </div>
  );
}

// ==========================================
// YouTubeライブ検索リンク
// ==========================================
function LiveSearchCard({ channel }: { channel: typeof LIVE_CHANNELS[0] }) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(channel.searchQuery + " " + new Date().toLocaleDateString("ja-JP"))}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5"
      style={{
        backgroundColor: "rgba(0,229,255,0.04)",
        border: "1px solid rgba(0,229,255,0.12)",
        borderRadius: "6px",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl"
          style={{
            backgroundColor: `${channel.color}15`,
            border: `1px solid ${channel.color}30`,
            borderRadius: "8px",
          }}
        >
          {channel.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-bold text-base"
              style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              {channel.name}
            </h3>
            {channel.isOfficial && (
              <span
                className="text-xs px-1.5 py-0.5"
                style={{
                  backgroundColor: "rgba(245,158,11,0.1)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: "3px",
                }}
              >
                公式
              </span>
            )}
          </div>
          <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
            {channel.description}
          </p>

          <div className="flex gap-2 flex-wrap">
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all duration-150 active:scale-95"
              style={{
                backgroundColor: "#ff000015",
                color: "#ff4444",
                border: "1px solid rgba(255,68,68,0.3)",
                borderRadius: "4px",
                fontFamily: "'Space Grotesk', sans-serif",
                textDecoration: "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTubeで検索
            </a>

            {channel.channelId && (
              <a
                href={`https://www.youtube.com/channel/${channel.channelId}/streams`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all duration-150 active:scale-95"
                style={{
                  backgroundColor: "rgba(0,229,255,0.08)",
                  color: "#00E5FF",
                  border: "1px solid rgba(0,229,255,0.2)",
                  borderRadius: "4px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  textDecoration: "none",
                }}
              >
                📺 配信一覧
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ==========================================
// メインページ
// ==========================================
export default function LivePage() {
  const [activeTab, setActiveTab] = useState<"channels" | "embed">("channels");

  // JRA公式の最新G1動画（固定ID - 実際のライブは別途確認が必要）
  const featuredVideoId = ""; // ライブ配信IDは動的に変わるため空欄

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128", color: "#e2e8f0" }}>
      <PageHead
        title="ライブ中継"
        description="JRA公式・グリーンチャンネル・YouTube無料配信へのリンクを一元化。レース直前のパドック確認もここから。競馬中継を無料で見る方法をまとめ。"
        path="/live"
        keywords="競馬 ライブ中継 無料,競馬 ネット中継,グリーンチャンネル 無料,JRAライブ,競馬 YouTube"
      />
      {/* ヘッダー */}
      <div className="pt-20 pb-8 px-4" style={{ borderBottom: "1px solid rgba(0,229,255,0.1)" }}>
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">📺</span>
              <h1
                className="text-2xl font-bold tracking-wider"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                LIVE VIEWING
              </h1>
              <span
                className="flex items-center gap-1 text-xs px-2 py-1 font-bold"
                style={{
                  backgroundColor: "rgba(239,68,68,0.15)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "4px",
                  animation: "pulse 2s infinite",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                LIVE
              </span>
            </div>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              {getTodayStr()} の競馬を無料で視聴。JRA公式・地方競馬公式チャンネルへのリンク集。
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 無料視聴の説明 */}
        <div
          className="p-4 mb-6 flex items-start gap-3"
          style={{
            backgroundColor: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: "6px",
          }}
        >
          <span className="text-xl flex-shrink-0">💡</span>
          <div>
            <p className="text-sm font-bold mb-1" style={{ color: "#10b981" }}>
              完全無料で視聴できます
            </p>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              JRA・NAR公式YouTubeチャンネルは無料でライブ配信・アーカイブを公開しています。
              Googleアカウントがあれば通知設定も可能です。
            </p>
          </div>
        </div>

        {/* タブ */}
        <div className="flex gap-2 mb-6">
          {[
            { key: "channels", label: "📺 チャンネル一覧" },
            { key: "embed", label: "▶️ 埋め込み視聴" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "channels" | "embed")}
              className="px-4 py-2 text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: activeTab === tab.key ? "#00E5FF" : "rgba(0,229,255,0.06)",
                color: activeTab === tab.key ? "#0A1128" : "#00E5FF",
                border: "1px solid rgba(0,229,255,0.3)",
                borderRadius: "4px",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "channels" ? (
          <div className="space-y-4">
            {LIVE_CHANNELS.map((channel, idx) => (
              <motion.div
                key={channel.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
              >
                <LiveSearchCard channel={channel} />
              </motion.div>
            ))}

            {/* 追加情報 */}
            <div
              className="p-4 mt-4"
              style={{
                backgroundColor: "rgba(0,229,255,0.03)",
                border: "1px solid rgba(0,229,255,0.08)",
                borderRadius: "6px",
              }}
            >
              <h3 className="text-sm font-bold mb-2" style={{ color: "#00E5FF" }}>
                📌 視聴のヒント
              </h3>
              <ul className="text-xs space-y-1" style={{ color: "#94a3b8" }}>
                <li>• JRA公式は土日のG1・G2・G3レースをほぼ全て無料ライブ配信</li>
                <li>• 地方競馬（NAR）は大井・川崎・船橋・浦和の夜間開催を配信</li>
                <li>• ライブ配信はレース開始30分前〜1時間前から開始されることが多い</li>
                <li>• アーカイブは配信終了後数時間で視聴可能になる</li>
              </ul>
            </div>
          </div>
        ) : (
          <div>
            <div
              className="p-6 text-center"
              style={{
                backgroundColor: "rgba(0,229,255,0.04)",
                border: "1px solid rgba(0,229,255,0.12)",
                borderRadius: "6px",
              }}
            >
              <div className="text-4xl mb-3">📺</div>
              <p className="text-base font-bold mb-2" style={{ color: "#e2e8f0" }}>
                埋め込み視聴
              </p>
              <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                YouTubeのライブ配信URLを入力すると、このページで直接視聴できます。
              </p>

              {/* YouTube URL入力 */}
              <div className="max-w-md mx-auto">
                <EmbedPlayer />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 埋め込みプレーヤーコンポーネント
// ==========================================
function EmbedPlayer() {
  const [inputUrl, setInputUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [error, setError] = useState("");

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /youtube\.com\/watch\?v=([^&]+)/,
      /youtu\.be\/([^?]+)/,
      /youtube\.com\/live\/([^?]+)/,
      /youtube\.com\/embed\/([^?]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleLoad = () => {
    const id = extractVideoId(inputUrl);
    if (id) {
      setVideoId(id);
      setError("");
    } else {
      setError("有効なYouTube URLを入力してください");
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="YouTube URLを貼り付け..."
          className="flex-1 px-3 py-2 text-sm"
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            color: "#e2e8f0",
            border: "1px solid rgba(0,229,255,0.2)",
            borderRadius: "4px",
            outline: "none",
          }}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
        />
        <button
          onClick={handleLoad}
          className="px-4 py-2 text-sm font-bold transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: "rgba(0,229,255,0.1)",
            color: "#00E5FF",
            border: "1px solid rgba(0,229,255,0.3)",
            borderRadius: "4px",
          }}
        >
          読込
        </button>
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}

      {videoId && (
        <div className="mt-4" style={{ border: "1px solid rgba(0,229,255,0.2)", borderRadius: "6px", overflow: "hidden" }}>
          <YouTubeEmbed videoId={videoId} title="競馬ライブ視聴" />
        </div>
      )}

      <p className="text-xs mt-3" style={{ color: "#64748b" }}>
        例: https://www.youtube.com/watch?v=xxxxx
      </p>
    </div>
  );
}
