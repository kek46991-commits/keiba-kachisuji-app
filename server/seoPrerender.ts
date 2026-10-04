/**
 * SEO Pre-render Module
 * クローラー（Googlebot, Twitterbot, Facebook等）がアクセスした際に、
 * ブログ記事のOGPメタタグを動的に注入する。
 */
import { getDb } from "./db";
import { blogPosts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const SITE_URL = "https://kachisujiweb-mr32htbm.manus.space";
const SITE_NAME = "競馬でGO！";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 静的ページのメタ情報
const STATIC_PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "競馬でGO！ — データで勝つ競馬予想アプリ",
    description: "スコア算出・騎手相性・天気・オッズ分析で「買うべき馬」を数値化する競馬予想アプリ。AI解析で3連単・馬連を自動予想。無料で今すぐ始められます。",
  },
  "/blog": {
    title: "ブログ | 競馬でGO！",
    description: "AI競馬予想・パドック分析・騎手統計など、データに基づいた競馬攻略記事を毎週更新。初心者から上級者まで役立つ情報満載。",
  },
  "/pricing": {
    title: "料金プラン | 競馬でGO！",
    description: "基本機能は完全無料。プレミアムプラン月額1,980円でAI解析・馬券予想が使い放題。10日間無料トライアル付き。",
  },
  "/predictions": {
    title: "レーススケジュール | 競馬でGO！",
    description: "JRA全レースのスケジュールを一覧表示。出走馬・オッズ・天気情報をリアルタイムで確認できます。",
  },
  "/horses": {
    title: "馬図鑑 | 競馬でGO！",
    description: "JRA登録馬の詳細データベース。血統・戦績・コース適性・脚質を一覧で確認。AI分析による勝率予測も。",
  },
  "/jockeys": {
    title: "騎手統計 | 競馬でGO！",
    description: "JRA全騎手の勝率・連対率・複勝率をランキング形式で表示。コース別・距離別の得意分野も分析。",
  },
  "/courses": {
    title: "競馬場データベース | 競馬でGO！",
    description: "JRA全10競馬場のコース特性・傾向を徹底分析。芝・ダート・距離別の有利な脚質や枠順データを提供。",
  },
  "/live": {
    title: "ライブ中継 | 競馬でGO！",
    description: "JRA公式・グリーンチャンネル・YouTube無料配信へのリンクを一元化。レース直前のパドック確認もここから。",
  },
  "/analyze": {
    title: "AI解析 | 競馬でGO！",
    description: "独自のスコアリングアルゴリズムで各馬の勝率を数値化。騎手相性・天気補正・オッズ分析を統合したAI予想。",
  },
  "/history": {
    title: "予想履歴 | 競馬でGO！",
    description: "過去のAI予想結果と的中実績を一覧表示。予想精度の推移を確認できます。",
  },
  "/yoso": {
    title: "AI予想 | 競馬でGO！",
    description: "独自のAIスコアリングで今日のレースを予想。ワイド・3連複・馬連の買い目を自動算出。競馬予想無料トライアル付き。",
  },
  "/how-it-works": {
    title: "仕組み | 競馬でGO！",
    description: "競馬でGO！のAI予想の仕組みを解説。スコア算出・騎手相性・オッズ分析のロジックを公開。",
  },
  "/entries": {
    title: "出馬表 | 競馬でGO！",
    description: "今日のレース出馬表。出走馬・騎手・枚番・オッズを一覧で確認。",
  },
};

/**
 * URLパスに基づいてクローラー向けのHTMLを生成する。
 * マッチしない場合はnullを返す。
 */
export async function getSeoHtmlForCrawler(originalUrl: string): Promise<string | null> {
  // クエリパラメータを除去
  const urlPath = originalUrl.split("?")[0];

  // ブログ記事の詳細ページ
  const blogSlugMatch = urlPath.match(/^\/blog\/([^/]+)$/);
  if (blogSlugMatch) {
    const slug = blogSlugMatch[1];
    try {
      const db = await getDb();
      if (!db) return null;

      const [post] = await db
        .select()
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, slug), eq(blogPosts.published, true)))
        .limit(1);

      if (!post) return null;

      const title = escapeHtml(`${post.title} | ${SITE_NAME}`);
      const description = escapeHtml(post.summary || post.title.substring(0, 160));
      const url = `${SITE_URL}/blog/${post.slug}`;
      const publishedTime = new Date(post.createdAt).toISOString();
      const modifiedTime = post.updatedAt
        ? new Date(post.updatedAt).toISOString()
        : publishedTime;

      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${url}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta property="article:published_time" content="${publishedTime}" />
  <meta property="article:modified_time" content="${modifiedTime}" />
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.summary || post.title,
    datePublished: publishedTime,
    dateModified: modifiedTime,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category,
    keywords: post.seoKeywords || "競馬予想,AI競馬",
  })}
  </script>
</head>
<body>
  <h1>${title}</h1>
  <article>${escapeHtml((post.content || post.summary || "").substring(0, 2000))}</article>
  <p>Published: ${publishedTime}</p>
</body>
</html>`;
    } catch (error) {
      console.error("[SEO Prerender] Blog error:", error);
      return null;
    }
  }

  // 静的ページ
  const meta = STATIC_PAGE_META[urlPath];
  if (meta) {
    const title = escapeHtml(meta.title);
    const description = escapeHtml(meta.description);
    const url = `${SITE_URL}${urlPath}`;

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
</body>
</html>`;
  }

  return null;
}
