import { Helmet } from "react-helmet-async";

const SITE_NAME = "競馬でGO！";
const BASE_URL = "https://kachisujiweb-mr32htbm.manus.space";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

interface PageHeadProps {
  title?: string;
  description?: string;
  path?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  keywords?: string;
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    section?: string;
    tags?: string[];
  };
}

export default function PageHead({
  title,
  description,
  path = "/",
  ogType = "website",
  ogImage,
  keywords,
  article,
}: PageHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — データで勝つ競馬予想アプリ`;
  const fullUrl = `${BASE_URL}${path}`;
  const imageUrl = ogImage || DEFAULT_OG_IMAGE;
  const desc = description || "スコア算出・騎手相性・天気・オッズ分析で「買うべき馬」を数値化する競馬予想アプリ。AI解析で3連単・馬連を自動予想。無料で今すぐ始められます。";

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="ja_JP" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Article metadata */}
      {article?.publishedTime && (
        <meta property="article:published_time" content={article.publishedTime} />
      )}
      {article?.modifiedTime && (
        <meta property="article:modified_time" content={article.modifiedTime} />
      )}
      {article?.author && <meta property="article:author" content={article.author} />}
      {article?.section && <meta property="article:section" content={article.section} />}
      {article?.tags?.map((tag) => (
        <meta property="article:tag" content={tag} key={tag} />
      ))}
    </Helmet>
  );
}
