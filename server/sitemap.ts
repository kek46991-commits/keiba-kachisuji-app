import { Express } from "express";
import { getDb } from "./db";
import { blogPosts } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const SITE_URL = "https://kachisujiweb-mr32htbm.manus.space";

export function registerSitemapRoute(app: Express) {
  app.get("/api/sitemap.xml", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) {
        res.status(500).send("Database not available");
        return;
      }

      // 公開済みブログ記事を取得
      const posts = await db
        .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt, createdAt: blogPosts.createdAt })
        .from(blogPosts)
        .where(eq(blogPosts.published, true))
        .orderBy(desc(blogPosts.createdAt));

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/predictions", priority: "0.9", changefreq: "daily" },
        { loc: "/blog", priority: "0.9", changefreq: "daily" },
        { loc: "/pricing", priority: "0.8", changefreq: "weekly" },
        { loc: "/live", priority: "0.8", changefreq: "daily" },
        { loc: "/courses", priority: "0.7", changefreq: "monthly" },
        { loc: "/horses", priority: "0.7", changefreq: "weekly" },
        { loc: "/jockeys", priority: "0.7", changefreq: "weekly" },
        { loc: "/how-to-use", priority: "0.6", changefreq: "monthly" },
        { loc: "/yoso", priority: "0.8", changefreq: "daily" },
        { loc: "/history", priority: "0.7", changefreq: "weekly" },
        { loc: "/analyze", priority: "0.8", changefreq: "daily" },
        { loc: "/entries", priority: "0.8", changefreq: "daily" },
      ];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

      // 静的ページ
      for (const page of staticPages) {
        xml += `  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
      }

      // ブログ記事
      for (const post of posts) {
        const lastmod = post.updatedAt || post.createdAt;
        const dateStr = lastmod ? new Date(lastmod).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        xml += `  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
      }

      xml += `</urlset>`;

      res.set("Content-Type", "application/xml");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (error) {
      console.error("[Sitemap] Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });
}
