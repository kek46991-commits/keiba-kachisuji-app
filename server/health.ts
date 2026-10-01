import type { Express, Request, Response } from "express";

/**
 * 外部の死活監視（UptimeRobot 等）からの定期アクセスでスリープを防ぐための軽量エンドポイント。
 * DBや外部サイトへは一切アクセスせず、プロセスが応答できることだけを返す。
 */
export function healthHandler(_req: Request, res: Response) {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

export function registerHealthRoutes(app: Express) {
  app.get("/api/health", healthHandler);
  app.get("/healthz", healthHandler);
  app.head("/api/health", (_req, res) => {
    res.status(200).end();
  });
  app.head("/healthz", (_req, res) => {
    res.status(200).end();
  });
}
