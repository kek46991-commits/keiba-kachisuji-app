import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

// 日付フォーマット
function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// カテゴリラベル
const CATEGORY_LABELS: Record<string, string> = {
  prediction: "🏇 予想",
  analysis: "📊 解析",
  course: "🏟️ コース",
  horse: "🐴 馬",
  jockey: "👤 騎手",
  news: "📰 ニュース",
};

// ==========================================
// 最新ブログ記事セクション（ホームページ用）
// ==========================================
export default function LatestBlogSection() {
  const { data: posts, isLoading } = trpc.blog.getLatest.useQuery({ limit: 3 });

  // 記事がない場合は非表示
  if (!isLoading && (!posts || posts.length === 0)) return null;

  return (
    <section className="py-16 px-4" style={{ backgroundColor: "#0A1128" }}>
      <div className="max-w-5xl mx-auto">
        {/* セクションヘッダー */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span
                className="text-xs font-bold tracking-widest"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                LATEST ARTICLES
              </span>
            </div>
            <h2
              className="text-2xl font-bold"
              style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              最新AI予想記事
            </h2>
          </div>

          <a
            href="/blog"
            className="text-sm font-medium transition-colors duration-150 flex items-center gap-1"
            style={{ color: "#00E5FF" }}
          >
            すべて見る →
          </a>
        </motion.div>

        {/* 記事グリッド */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 animate-pulse"
                style={{
                  backgroundColor: "rgba(0,229,255,0.04)",
                  border: "1px solid rgba(0,229,255,0.08)",
                  borderRadius: "6px",
                  height: "160px",
                }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(posts ?? []).map((post, idx) => (
              <motion.a
                key={post.id}
                href={`/blog`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.4 }}
                className="block p-5 transition-all duration-150 hover:scale-[1.02] active:scale-[0.99]"
                style={{
                  backgroundColor: "rgba(0,229,255,0.04)",
                  border: "1px solid rgba(0,229,255,0.12)",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      backgroundColor: "rgba(0,229,255,0.1)",
                      color: "#00E5FF",
                      border: "1px solid rgba(0,229,255,0.2)",
                      borderRadius: "3px",
                    }}
                  >
                    {CATEGORY_LABELS[post.category] ?? post.category}
                  </span>
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    {formatDate(post.createdAt)}
                  </span>
                </div>

                <h3
                  className="font-bold text-sm mb-2 line-clamp-2"
                  style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
                >
                  {post.title}
                </h3>

                {post.summary && (
                  <p className="text-xs line-clamp-2" style={{ color: "#94a3b8" }}>
                    {post.summary}
                  </p>
                )}

                {post.venue && (
                  <div className="mt-3 text-xs" style={{ color: "#64748b" }}>
                    📍 {post.venue}
                  </div>
                )}
              </motion.a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
