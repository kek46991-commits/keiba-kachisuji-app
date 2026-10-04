import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getSeoHtmlForCrawler } from "../seoPrerender";

const CRAWLER_RE = /googlebot|bingbot|twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|whatsapp|line-poker|telegrambot/i;

function isCrawler(req: Request): boolean {
  const ua = req.headers["user-agent"] || "";
  return CRAWLER_RE.test(ua);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req: Request, res: Response, next: NextFunction) => {
    // クローラーの場合はSEOプリレンダリングHTMLを返す
    if (isCrawler(req)) {
      try {
        const html = await getSeoHtmlForCrawler(req.originalUrl);
        if (html) {
          res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(html);
          return;
        }
      } catch (e) {
        console.error("[SEO Prerender] Error:", e);
      }
      // フォールバック: 通常のindex.htmlを返す
    }

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req: Request, res: Response) => {
    // クローラーの場合はSEOプリレンダリングHTMLを返す
    if (isCrawler(req)) {
      try {
        const html = await getSeoHtmlForCrawler(req.originalUrl);
        if (html) {
          res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).end(html);
          return;
        }
      } catch (e) {
        console.error("[SEO Prerender] Error:", e);
      }
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
