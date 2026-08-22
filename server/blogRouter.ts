import { getDb } from "./db";
import { blogPosts, newsItems } from "../drizzle/schema";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { eq, desc, and, or, ne } from "drizzle-orm";
import { z } from "zod";

// ==========================================
// Gemini APIを使ってブログ記事を自動生成
// ==========================================
// 馬の豆知識・基本情報テーマリスト（毎日ランダムに選択）
const HORSE_TRIVIA_THEMES = [
  "サラブレッドの体の仕組みと特徴（骨格・筋肉・心肺機能）",
  "競走馬の脚質（逃げ・先行・差し・追込）の違いと特徴",
  "馬の毛色の種類と遺伝の仕組み（鹿毛・栗毛・芦毛など）",
  "競走馬の年齢と競走能力の関係（2歳〜引退まで）",
  "馬の蹄（ひづめ）の構造と蹄鉄の役割",
  "競走馬の調教方法と坂路・ウッドチップコースの違い",
  "馬の睡眠と休息の特徴（立ったまま眠る理由）",
  "競走馬の食事と栄養管理（飼料・サプリメント）",
  "馬の視覚・聴覚・嗅覚の特徴と競走への影響",
  "サラブレッドの血統と配合理論（父系・母系の重要性）",
  "競走馬の引退後（種牡馬・繁殖牝馬・乗馬への転身）",
  "馬の気性と精神的特徴（臆病さ・好奇心・競争本能）",
  "競馬場の芝コースとダートコースの違い",
  "洋芝と野芝の違いと競走への影響（北海道・函館・札幌）",
  "競走馬の体重管理と馬体重の変動が示すもの",
  "馬のストレスとブリンカー・チークピーシーズの役割",
  "競走馬の怪我（骨折・腱炎）と回復の仕組み",
  "日本の競馬の歴史（明治時代から現代まで）",
  "JRAのグレード制度（G1・G2・G3）の意味と格付け",
  "競走馬の輸送ストレスと遠征競馬の難しさ",
  "馬の繁殖サイクルと競走馬が生まれるまで",
  "斤量（負担重量）が競走に与える影響",
  "競走馬の騎手との信頼関係とコミュニケーション",
  "競馬の馬券の種類（単勝・複勝・馬連・三連単など）",
  "競走馬のコーナリング技術と内外の有利不利",
];

async function generateHorseTriviaWithGemini(theme: string, date: string): Promise<{ title: string; content: string; summary: string; seoKeywords: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const prompt = `あなたは競馬・馬の専門家です。以下のテーマについて、読者が楽しく学べる競馬豆知識・馬の基本情報ブログ記事を日本語で書いてください。

テーマ: ${theme}

記事の要件:
1. タイトルは興味を引く表現で、テーマのキーワードを含める（例: 「知らなかった！〜の秘密」「競馬ファン必見！〜」）
2. 本文は1200〜1800文字で、以下の構成にする:
   - 導入（なぜこのテーマが面白いか）
   - メインの解説（具体的なデータや事例を交えて）
   - 競馬予想・馬券購入への活かし方
   - まとめ・豆知識
3. 競馬初心者でも理解できるよう、専門用語には簡単な説明を付ける
4. 具体的な馬名や騎手名を例として挙げると読みやすい
5. 読者が「なるほど！」と思えるような新しい視点を提供する

以下のJSON形式で返してください:
{
  "title": "記事タイトル",
  "content": "記事本文（Markdown形式）",
  "summary": "記事の要約（150文字以内）",
  "seoKeywords": "SEOキーワード（カンマ区切り、10個程度）"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 3000,
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini response does not contain valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    title: string;
    content: string;
    summary: string;
    seoKeywords: string;
  };
  return parsed;
}

async function generateBlogWithGemini(params: {
  raceName: string;
  venue: string;
  grade: string;
  distance: number;
  surface: string;
  raceDate: string;
  horses?: string[];
}): Promise<{ title: string; content: string; summary: string; seoKeywords: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const surfaceJa = params.surface === "turf" ? "芝" : "ダート";
  const horsesText = params.horses && params.horses.length > 0
    ? `\n出走予定馬: ${params.horses.join("、")}`
    : "";

  const prompt = `あなたは競馬予想の専門家です。以下のレース情報をもとに、SEO最適化された競馬予想ブログ記事を日本語で書いてください。

レース情報:
- レース名: ${params.raceName}（${params.grade}）
- 開催日: ${params.raceDate}
- 競馬場: ${params.venue}
- 距離: ${surfaceJa}${params.distance}m${horsesText}

記事の要件:
1. タイトルはSEOを意識し、レース名・競馬場・予想・穴馬などのキーワードを含める
2. 本文は1500〜2000文字で、以下の構成にする:
   - リード文（レースの見どころ）
   - コース特性と有利な脚質
   - 注目馬・有力馬の分析
   - 穴馬候補
   - 買い目の方向性
   - まとめ
3. 読者が競馬初心者でも理解できるよう、専門用語には簡単な説明を付ける
4. 断定的な表現は避け、「〜と見る」「〜が有力」などの表現を使う

以下のJSON形式で返してください:
{
  "title": "記事タイトル",
  "content": "記事本文（Markdown形式）",
  "summary": "記事の要約（150文字以内）",
  "seoKeywords": "SEOキーワード（カンマ区切り、10個程度）"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 3000,
        },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // JSONを抽出（コードブロックを除去）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini response does not contain valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    title: string;
    content: string;
    summary: string;
    seoKeywords: string;
  };
  return parsed;
}

// スラッグ生成（日付+レース名から）
function generateSlug(raceName: string, raceDate: string): string {
  const dateStr = raceDate.replace(/-/g, "");
  const nameSlug = raceName
    .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/g, "-")
    .toLowerCase()
    .slice(0, 50);
  return `${dateStr}-${nameSlug}-${Date.now()}`;
}

// ==========================================
// tRPCルーター定義
// ==========================================
export const blogRouter = router({
  // ブログ記事一覧取得（公開済みのみ）
  getPublished: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      offset: z.number().min(0).default(0),
      category: z.enum(["prediction", "analysis", "course", "horse", "jockey", "news"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { posts: [], total: 0 };

      const conditions = [eq(blogPosts.published, true)];
      if (input.category) {
        conditions.push(eq(blogPosts.category, input.category));
      }

      const posts = await db
        .select()
        .from(blogPosts)
        .where(and(...conditions))
        .orderBy(desc(blogPosts.isPinned), desc(blogPosts.isBreaking), desc(blogPosts.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { posts, total: posts.length };
    }),

  // 速報・ピン留め記事を取得（トップページ用）
  getBreakingNews: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const posts = await db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          summary: blogPosts.summary,
          category: blogPosts.category,
          raceName: blogPosts.raceName,
          venue: blogPosts.venue,
          isPinned: blogPosts.isPinned,
          isBreaking: blogPosts.isBreaking,
          updatedAt: blogPosts.updatedAt,
          createdAt: blogPosts.createdAt,
        })
        .from(blogPosts)
        .where(and(
          eq(blogPosts.published, true),
          or(eq(blogPosts.isPinned, true), eq(blogPosts.isBreaking, true))
        ))
        .orderBy(desc(blogPosts.isPinned), desc(blogPosts.updatedAt))
        .limit(5);

      return posts;
    }),

  // スラッグで記事取得
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [post] = await db
        .select()
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, input.slug), eq(blogPosts.published, true)))
        .limit(1);

      return post ?? null;
    }),

  // 最新記事取得（トップページ用）
  getLatest: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(10).default(3) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const posts = await db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          summary: blogPosts.summary,
          category: blogPosts.category,
          raceName: blogPosts.raceName,
          venue: blogPosts.venue,
          createdAt: blogPosts.createdAt,
        })
        .from(blogPosts)
        .where(eq(blogPosts.published, true))
        .orderBy(desc(blogPosts.createdAt))
        .limit(input.limit);

      return posts;
    }),

  // Geminiで記事を自動生成してDBに保存
  generateAndSave: publicProcedure
    .input(z.object({
      raceName: z.string(),
      venue: z.string(),
      grade: z.string().default("OP"),
      distance: z.number().default(2000),
      surface: z.enum(["turf", "dirt"]).default("turf"),
      raceDate: z.string(), // YYYY-MM-DD
      horses: z.array(z.string()).optional(),
      publish: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Geminiで記事生成
      const generated = await generateBlogWithGemini({
        raceName: input.raceName,
        venue: input.venue,
        grade: input.grade,
        distance: input.distance,
        surface: input.surface,
        raceDate: input.raceDate,
        horses: input.horses,
      });

      const slug = generateSlug(input.raceName, input.raceDate);

      // DBに保存
      await db.insert(blogPosts).values({
        title: generated.title,
        slug,
        content: generated.content,
        summary: generated.summary,
        category: "prediction",
        raceName: input.raceName,
        venue: input.venue,
        published: input.publish,
        isAutoGenerated: true,
        seoKeywords: generated.seoKeywords,
      });

      // 保存した記事を返す
      const [saved] = await db
        .select()
        .from(blogPosts)
        .where(eq(blogPosts.slug, slug))
        .limit(1);

      return saved;
    }),

  // 今日の重賞レース予想記事を自動生成（一括）
  generateTodayPredictions: publicProcedure.mutation(async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

    // 今日の重賞レースリスト（ハードコード + 将来的にはDBから取得）
    const todayRaces = [
      { raceName: "関屋記念", venue: "新潟", grade: "G3", distance: 1600, surface: "turf" as const },
      { raceName: "東海ステークス", venue: "中京", grade: "G3", distance: 1400, surface: "dirt" as const },
    ];

    const results = [];
    for (const race of todayRaces) {
      try {
        const db = await getDb();
        if (!db) continue;

        const generated = await generateBlogWithGemini({
          ...race,
          raceDate: today,
        });

        const slug = generateSlug(race.raceName, today);

        await db.insert(blogPosts).values({
          title: generated.title,
          slug,
          content: generated.content,
          summary: generated.summary,
          category: "prediction",
          raceName: race.raceName,
          venue: race.venue,
          published: true,
          isAutoGenerated: true,
          seoKeywords: generated.seoKeywords,
        });

        results.push({ raceName: race.raceName, slug, success: true });
      } catch (e) {
        console.error(`[blogRouter] 記事生成失敗: ${race.raceName}`, e);
        results.push({ raceName: race.raceName, slug: "", success: false, error: String(e) });
      }
    }

    return results;
  }),

  // 今日の馬豆知識・基本情報記事を自動生成
  generateDailyHorseTrivia: publicProcedure.mutation(async () => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

    // 日付をシードにしてテーマを選択（同じ日は同じテーマ）
    const dayOfYear = Math.floor(
      (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    const theme = HORSE_TRIVIA_THEMES[dayOfYear % HORSE_TRIVIA_THEMES.length];

    try {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const generated = await generateHorseTriviaWithGemini(theme, today);
      const slug = generateSlug(`horse-trivia-${dayOfYear}`, today);

      await db.insert(blogPosts).values({
        title: generated.title,
        slug,
        content: generated.content,
        summary: generated.summary,
        category: "horse",
        published: true,
        isAutoGenerated: true,
        seoKeywords: generated.seoKeywords,
      });

      return { theme, slug, success: true };
    } catch (e) {
      console.error(`[blogRouter] 馬豆知識記事生成失敗`, e);
      return { theme, slug: "", success: false, error: String(e) };
    }
  }),

  // 関連記事取得（同カテゴリの記事を最大3件、なければ最新記事から補充）
  getRelated: publicProcedure
    .input(z.object({
      slug: z.string(),
      category: z.enum(["prediction", "analysis", "course", "horse", "jockey", "news"]),
      limit: z.number().min(1).max(5).default(3),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // 同カテゴリの記事を取得
      let posts = await db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          summary: blogPosts.summary,
          category: blogPosts.category,
          createdAt: blogPosts.createdAt,
        })
        .from(blogPosts)
        .where(and(
          eq(blogPosts.published, true),
          eq(blogPosts.category, input.category),
          ne(blogPosts.slug, input.slug)
        ))
        .orderBy(desc(blogPosts.createdAt))
        .limit(input.limit);
      // 同カテゴリが足りない場合は最新記事で補充
      if (posts.length < input.limit) {
        const remaining = input.limit - posts.length;
        const existingSlugs = [input.slug, ...posts.map(p => p.slug)];
        const morePosts = await db
          .select({
            id: blogPosts.id,
            title: blogPosts.title,
            slug: blogPosts.slug,
            summary: blogPosts.summary,
            category: blogPosts.category,
            createdAt: blogPosts.createdAt,
          })
          .from(blogPosts)
          .where(and(
            eq(blogPosts.published, true),
            ...existingSlugs.map(s => ne(blogPosts.slug, s))
          ))
          .orderBy(desc(blogPosts.createdAt))
          .limit(remaining);
        posts = [...posts, ...morePosts];
      }
      return posts;
    }),

  // ピックアップニュース取得（写真付きトップページ用）
  getPickupNews: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const items = await db
        .select()
        .from(newsItems)
        .where(and(
          eq(newsItems.isActive, true),
          eq(newsItems.isPickup, true)
        ))
        .orderBy(desc(newsItems.publishedAt))
        .limit(6);
      return items;
    }),
});
