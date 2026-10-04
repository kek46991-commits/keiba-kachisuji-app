import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import PageHead from "@/components/PageHead";
import RelatedArticles from "@/components/RelatedArticles";

// ==========================================
// 読了時間計算ユーティリティ
// ==========================================
function estimateReadingTime(content: string): number {
  // 日本語: 約500文字/分、英語: 約200語/分
  const charCount = content.replace(/\s/g, "").length;
  const minutes = Math.ceil(charCount / 500);
  return Math.max(1, minutes);
}

// ==========================================
// スクロールプログレスバー + 読了時間コンポーネント
// ==========================================
function ReadingProgressBar({ content }: { content: string }) {
  const [progress, setProgress] = useState(0);
  const readingTime = estimateReadingTime(content);

  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) {
      setProgress(100);
      return;
    }
    const scrollPercent = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
    setProgress(scrollPercent);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div
      className="fixed top-[60px] left-0 right-0 z-40"
      style={{ pointerEvents: "none" }}
    >
      {/* プログレスバー */}
      <div
        className="w-full"
        style={{ height: "3px", backgroundColor: "rgba(0,229,255,0.1)" }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: "#00E5FF",
            transition: "width 100ms ease-out",
            boxShadow: "0 0 8px rgba(0,229,255,0.4)",
          }}
        />
      </div>
      {/* 読了目安時間バッジ */}
      <div
        className="flex items-center justify-end px-4 py-1"
        style={{ pointerEvents: "auto" }}
      >
        <span
          className="text-[10px] px-2 py-0.5 flex items-center gap-1"
          style={{
            backgroundColor: "rgba(10,17,40,0.85)",
            color: "#94a3b8",
            border: "1px solid rgba(0,229,255,0.15)",
            borderRadius: "3px",
            backdropFilter: "blur(4px)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          読了約{readingTime}分 ・ {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

// ==========================================
// 型定義
// ==========================================
interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content?: string;
  summary?: string | null;
  category: string;
  raceName?: string | null;
  venue?: string | null;
  isPinned?: boolean;
  isBreaking?: boolean;
  seoKeywords?: string | null;
  updatedAt?: Date;
  createdAt: Date;
}

// ==========================================
// カテゴリ表示名
// ==========================================
const CATEGORY_LABELS: Record<string, string> = {
  prediction: "🏇 予想",
  analysis: "📊 解析",
  course: "🏟️ コース",
  horse: "🐴 馬",
  jockey: "👤 騎手",
  news: "📰 ニュース",
};

// 日付フォーマット
function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ==========================================
// 記事カードコンポーネント
// ==========================================
function BlogCard({ post, onClick }: { post: BlogPost; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 cursor-pointer transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
      style={{
        backgroundColor: post.isBreaking ? "rgba(239,68,68,0.05)" : post.isPinned ? "rgba(245,158,11,0.04)" : "rgba(0,229,255,0.04)",
        border: post.isBreaking ? "1px solid rgba(239,68,68,0.2)" : post.isPinned ? "1px solid rgba(245,158,11,0.15)" : "1px solid rgba(0,229,255,0.12)",
        borderRadius: "6px",
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {post.isBreaking && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 inline-flex items-center gap-1"
              style={{
                backgroundColor: "rgba(239,68,68,0.15)",
                color: "#ef4444",
                borderRadius: "3px",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
              LIVE
            </span>
          )}
          {post.isPinned && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5"
              style={{
                backgroundColor: "rgba(245,158,11,0.12)",
                color: "#f59e0b",
                borderRadius: "3px",
              }}
            >
              固定
            </span>
          )}
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
        </div>
        <span className="text-xs whitespace-nowrap" style={{ color: "#64748b" }}>
          {post.updatedAt && post.isBreaking
            ? new Date(post.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + "更新"
            : formatDate(post.createdAt)}
        </span>
      </div>

      <h3
        className="font-bold text-base mb-2 line-clamp-2"
        style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
      >
        {post.title}
      </h3>

      {post.summary && (
        <p className="text-sm line-clamp-3" style={{ color: "#94a3b8" }}>
          {post.summary}
        </p>
      )}

      {(post.raceName || post.venue) && (
        <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "#64748b" }}>
          {post.venue && <span>📍 {post.venue}</span>}
          {post.raceName && <span>🏇 {post.raceName}</span>}
        </div>
      )}
    </motion.div>
  );
}

// ==========================================
// 記事詳細コンポーネント
// ==========================================
function BlogDetail({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data: post, isLoading } = trpc.blog.getBySlug.useQuery({ slug });

  if (isLoading) {
    return (
      <div className="text-center py-12" style={{ color: "#64748b" }}>
        <div className="text-2xl mb-2">⏳</div>
        <p>記事を読み込み中...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-12" style={{ color: "#64748b" }}>
        <div className="text-4xl mb-3">📄</div>
        <p>記事が見つかりませんでした</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 text-sm"
          style={{ color: "#00E5FF", border: "1px solid rgba(0,229,255,0.3)", borderRadius: "4px" }}
        >
          ← 一覧に戻る
        </button>
      </div>
    );
  }

  return (
    <>
    <ReadingProgressBar content={post.content} />
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <PageHead
        title={post.title}
        description={post.summary || `${post.title} - 競馬でGO！のブログ記事`}
        path={`/blog/${post.slug}`}
        ogType="article"
        keywords={post.seoKeywords || undefined}
        article={{
          publishedTime: new Date(post.createdAt).toISOString(),
          section: post.category,
        }}
      />
      {/* Article JSON-LD 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": post.title,
            "description": post.summary || post.title,
            "datePublished": new Date(post.createdAt).toISOString(),
            "dateModified": post.updatedAt ? new Date(post.updatedAt).toISOString() : new Date(post.createdAt).toISOString(),
            "author": { "@type": "Organization", "name": "競馬でGO！" },
            "publisher": {
              "@type": "Organization",
              "name": "競馬でGO！",
              "url": "https://kachisujiweb-mr32htbm.manus.space"
            },
            "mainEntityOfPage": {
              "@type": "WebPage",
              "@id": `https://kachisujiweb-mr32htbm.manus.space/blog/${post.slug}`
            },
            "articleSection": post.category,
            "keywords": post.seoKeywords || "競馬予想,AI競馬"
          })
        }}
      />
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm mb-6 transition-colors"
        style={{ color: "#00E5FF" }}
      >
        ← 記事一覧に戻る
      </button>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
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
          {post.isAutoGenerated && (
            <span
              className="text-xs px-2 py-0.5"
              style={{
                backgroundColor: "rgba(139,92,246,0.1)",
                color: "#a78bfa",
                border: "1px solid rgba(139,92,246,0.2)",
                borderRadius: "3px",
              }}
            >
              AI生成
            </span>
          )}
        </div>

        <h1
          className="text-2xl font-bold mb-4"
          style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          {post.title}
        </h1>

        {post.summary && (
          <p
            className="text-sm p-4 mb-6"
            style={{
              color: "#94a3b8",
              backgroundColor: "rgba(0,229,255,0.04)",
              border: "1px solid rgba(0,229,255,0.1)",
              borderRadius: "4px",
            }}
          >
            {post.summary}
          </p>
        )}
      </div>

      {/* 記事本文（Markdownをシンプルに表示） */}
      <div
        className="prose prose-invert max-w-none text-sm leading-relaxed"
        style={{ color: "#cbd5e1" }}
      >
        {post.content.split("\n").map((line, idx) => {
          if (line.startsWith("## ")) {
            return (
              <h2
                key={idx}
                className="text-lg font-bold mt-6 mb-3"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {line.replace("## ", "")}
              </h2>
            );
          }
          if (line.startsWith("### ")) {
            return (
              <h3
                key={idx}
                className="text-base font-bold mt-4 mb-2"
                style={{ color: "#e2e8f0" }}
              >
                {line.replace("### ", "")}
              </h3>
            );
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <li key={idx} className="ml-4 mb-1" style={{ color: "#94a3b8" }}>
                {line.replace(/^[-*] /, "")}
              </li>
            );
          }
          if (line.trim() === "") {
            return <br key={idx} />;
          }
          return (
            <p key={idx} className="mb-3">
              {line}
            </p>
          );
        })}
      </div>

      {/* 速報・パドック導線 */}
      {post.category === "prediction" && (
        <div
          className="mt-8 p-4"
          style={{
            backgroundColor: "rgba(239,68,68,0.05)",
            border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: "6px",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 inline-flex items-center gap-1"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: "3px" }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
              LIVE
            </span>
            <span className="text-xs font-bold" style={{ color: "#e2e8f0" }}>当日の速報をチェック</span>
          </div>
          <p className="text-xs mb-3" style={{ color: "#94a3b8" }}>
            馬体重・パドック気配の直前速報は、当日のYouTubeライブ配信でリアルタイム確認できます。
            パドックを見て最終判断を下しましょう！
          </p>
          <a
            href="/live"
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-2 transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "rgba(239,68,68,0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "4px",
              textDecoration: "none",
            }}
          >
            📺 ライブ配信でパドックを見る →
          </a>
        </div>
      )}

      {/* SEOキーワード */}
      {post.seoKeywords && (
        <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(0,229,255,0.1)" }}>
          <p className="text-xs mb-2" style={{ color: "#64748b" }}>関連キーワード:</p>
          <div className="flex flex-wrap gap-2">
            {post.seoKeywords.split(",").map((kw, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  color: "#64748b",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "3px",
                }}
              >
                {kw.trim()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SNSシェアボタン */}
      <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(0,229,255,0.1)" }}>
        <div className="text-center mb-4">
          <p className="text-sm font-bold mb-1" style={{ color: "#e2e8f0" }}>この記事が参考になったらシェア！</p>
          <p className="text-xs" style={{ color: "#64748b" }}>競馬仲間に広めて一緒に勝ちましょう</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {/* X（旧Twitter） */}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title + "\n\n#競馬予想 #競馬でGO")}&url=${encodeURIComponent(`https://kachisujiweb-mr32htbm.manus.space/blog/${post.slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold px-5 py-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "rgba(29,155,240,0.1)",
              color: "#1d9bf0",
              border: "1px solid rgba(29,155,240,0.3)",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Xでシェア
          </a>
          {/* LINE */}
          <a
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(`https://kachisujiweb-mr32htbm.manus.space/blog/${post.slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold px-5 py-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "rgba(6,199,85,0.1)",
              color: "#06c755",
              border: "1px solid rgba(6,199,85,0.3)",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            LINEでシェア
          </a>
          {/* はてなブックマーク */}
          <a
            href={`https://b.hatena.ne.jp/entry/s/kachisujiweb-mr32htbm.manus.space/blog/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold px-5 py-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "rgba(0,122,204,0.1)",
              color: "#007acc",
              border: "1px solid rgba(0,122,204,0.3)",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.47 21.2c-.7.7-1.52 1.05-2.47 1.05-.95 0-1.77-.35-2.47-1.05-.7-.7-1.05-1.52-1.05-2.47s.35-1.77 1.05-2.47c.7-.7 1.52-1.05 2.47-1.05.95 0 1.77.35 2.47 1.05.7.7 1.05 1.52 1.05 2.47s-.35 1.77-1.05 2.47zM16.2 2.8h3.6v12h-3.6V2.8zM4.2 2.8h3.6v5.1l4.5-5.1h4.5l-5.4 5.85L17.1 14.8h-4.65l-4.65-5.1v5.1H4.2V2.8z" />
            </svg>
            はてブ
          </a>
          {/* Facebook */}
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://kachisujiweb-mr32htbm.manus.space/blog/${post.slug}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold px-5 py-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "rgba(24,119,242,0.1)",
              color: "#1877f2",
              border: "1px solid rgba(24,119,242,0.3)",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook
          </a>
        </div>
      </div>

      {/* プレミアムプランCTA */}
      <div
        className="mt-10 p-6 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(0,229,255,0.06) 100%)",
          border: "1px solid rgba(212,175,55,0.25)",
          borderRadius: "8px",
        }}
      >
        <div className="mb-3">
          <span
            className="inline-block text-[10px] font-bold px-2 py-0.5 mb-2"
            style={{
              backgroundColor: "rgba(212,175,55,0.15)",
              color: "#d4af37",
              borderRadius: "3px",
            }}
          >
            PREMIUM
          </span>
        </div>
        <h4
          className="text-lg font-bold mb-2"
          style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          AI予想で「勝ち筋」を見つける
        </h4>
        <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
          コース特性・騎手相性・天候補正・オッズ分析を統合した
          AIスコアリングで、「買うべき馬」を自動で導き出します。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 transition-all duration-150 active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #d4af37 0%, #f5d76e 100%)",
              color: "#0a1128",
              borderRadius: "6px",
              textDecoration: "none",
              boxShadow: "0 2px 12px rgba(212,175,55,0.3)",
            }}
          >
            🏆 10日間無料で試す →
          </a>
          <span className="text-xs" style={{ color: "#64748b" }}>
            月額1,980円・いつでも解約OK
          </span>
        </div>
      </div>

      {/* メールマガジン登録フォーム */}
      <NewsletterSignup source={`/blog/${post.slug}`} />

      {/* 関連記事セクション */}
      <RelatedArticles slug={post.slug} category={post.category} />
    </motion.div>
    </>
  );
}

// ==========================================
// メールマガジン登録フォームコンポーネント
// ==========================================
function NewsletterSignup({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  const subscribeMutation = trpc.newsletter.subscribe.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      setMessage(data.message);
    },
    onError: (err) => {
      setMessage(err.message || "登録に失敗しました。もう一度お試しください。");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    subscribeMutation.mutate({ email: email.trim(), source });
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="mt-8 p-8 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(212,175,55,0.06) 100%)",
          border: "1px solid rgba(0,229,255,0.3)",
          borderRadius: "12px",
          boxShadow: "0 4px 24px rgba(0,229,255,0.1)",
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5, type: "spring", stiffness: 200, damping: 12 }}
          className="text-5xl mb-4"
        >
          🎉
        </motion.div>
        <motion.h4
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-lg font-bold mb-2"
          style={{ color: "#00E5FF", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          登録ありがとうございます！
        </motion.h4>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="text-sm mb-1"
          style={{ color: "#e2e8f0" }}
        >
          {message}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="text-xs mt-3"
          style={{ color: "#64748b" }}
        >
          毎週金曜日に週末の注目レース予想をお届けします 🏇
        </motion.p>
      </motion.div>
    );
  }

  return (
    <div
      className="mt-8 p-6"
      style={{
        background: "rgba(0,229,255,0.04)",
        border: "1px solid rgba(0,229,255,0.15)",
        borderRadius: "8px",
      }}
    >
      <div className="text-center mb-4">
        <span
          className="inline-block text-[10px] font-bold px-2 py-0.5 mb-2"
          style={{
            backgroundColor: "rgba(0,229,255,0.12)",
            color: "#00E5FF",
            borderRadius: "3px",
          }}
        >
          FREE
        </span>
        <h4
          className="text-base font-bold mb-1"
          style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
        >
          毎週の無料予想を受け取る
        </h4>
        <p className="text-xs" style={{ color: "#94a3b8" }}>
          毎週金曜に週末の注目レース・AI予想ダイジェストをメールでお届け。登録無料・解除自由。
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="flex-1 w-full sm:w-auto px-4 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(0,229,255,0.2)",
            borderRadius: "6px",
            color: "#e2e8f0",
          }}
        />
        <button
          type="submit"
          disabled={subscribeMutation.isPending}
          className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
          style={{
            backgroundColor: "#00E5FF",
            color: "#0a1128",
            borderRadius: "6px",
            border: "none",
            cursor: subscribeMutation.isPending ? "wait" : "pointer",
          }}
        >
          {subscribeMutation.isPending ? "登録中..." : "📨 無料で受け取る"}
        </button>
      </form>
      {message && !submitted && (
        <p className="text-xs text-center mt-2" style={{ color: "#ef4444" }}>
          {message}
        </p>
      )}
    </div>
  );
}

// ==========================================
// メインページ
// ==========================================
export default function BlogPage() {
  const params = useParams<{ slug?: string }>();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(params.slug || null);
  const [, navigate] = useLocation();

  // URLパラメータからslugが変わったら反映
  useEffect(() => {
    if (params.slug) {
      setSelectedSlug(params.slug);
    }
  }, [params.slug]);

  // ブログ記事一覧取得
  const { data: blogData, isLoading, refetch } = trpc.blog.getPublished.useQuery({ limit: 20, offset: 0 });

  // Gemini記事生成
  const generateMutation = trpc.blog.generateTodayPredictions.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const posts = blogData?.posts ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128", color: "#e2e8f0" }}>
      {/* ヘッダー */}
      <div className="pt-20 pb-8 px-4" style={{ borderBottom: "1px solid rgba(0,229,255,0.1)" }}>
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">📝</span>
                  <h1
                    className="text-2xl font-bold tracking-wider"
                    style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    競馬でGO！ BLOG
                  </h1>
                </div>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  AIが毎日自動生成する競馬予想・解析記事
                </p>
              </div>

              {/* AI生成ボタン */}
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all duration-150 active:scale-95"
                style={{
                  backgroundColor: generateMutation.isPending ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.15)",
                  color: "#a78bfa",
                  border: "1px solid rgba(139,92,246,0.3)",
                  borderRadius: "4px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  opacity: generateMutation.isPending ? 0.7 : 1,
                }}
              >
                {generateMutation.isPending ? (
                  <>⏳ 生成中...</>
                ) : (
                  <>✨ AI記事生成</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {selectedSlug ? (
          <BlogDetail slug={selectedSlug} onBack={() => setSelectedSlug(null)} />
        ) : (
          <>
            {isLoading ? (
              <div className="text-center py-12" style={{ color: "#64748b" }}>
                <div className="text-2xl mb-2">⏳</div>
                <p>記事を読み込み中...</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12" style={{ color: "#64748b" }}>
                <div className="text-4xl mb-3">📝</div>
                <p className="text-lg font-medium mb-2">まだ記事がありません</p>
                <p className="text-sm mb-6">「AI記事生成」ボタンで今日の予想記事を自動生成できます</p>
                <button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="px-6 py-3 font-bold text-sm transition-all duration-150 active:scale-95"
                  style={{
                    backgroundColor: "rgba(0,229,255,0.1)",
                    color: "#00E5FF",
                    border: "1px solid rgba(0,229,255,0.3)",
                    borderRadius: "4px",
                  }}
                >
                  {generateMutation.isPending ? "⏳ 生成中..." : "✨ 今日の予想記事を生成する"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post, idx) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <BlogCard
                      post={post as BlogPost}
                      onClick={() => setSelectedSlug(post.slug)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
