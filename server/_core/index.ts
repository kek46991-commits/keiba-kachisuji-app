import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerStripeWebhook } from "../stripe/webhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { fetchNewsHandler } from "../scheduled/fetchNews";
import { fetchJraScheduleHandler } from "../scheduled/fetchJraSchedule";
import { fetchNarScheduleHandler } from "../scheduled/fetchNarSchedule";
import { fetchNarOddsHandler } from "../scheduled/fetchNarOdds";
import { generateRacePredictionsHandler } from "../scheduled/generateRacePredictions";
import { ingestRaceCardsHandler, ingestRaceResultsHandler, ingestionStatusHandler, runIngestionHandler } from "../scraping/ingestionRoutes";
import { startIngestionScheduler } from "../scraping/ingestionScheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Stripe webhook needs raw body BEFORE json parser
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

  // Configure body parser
  app.use(express.json({ limit: "50mb", verify: (req: any, _res, buf) => { req.rawBody = buf.toString(); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerStripeWebhook(app);
  registerOAuthRoutes(app);

  // Scheduled job handlers (Heartbeat callbacks)
  app.post("/api/scheduled/fetchNews", fetchNewsHandler);
  app.post("/api/scheduled/fetchJraSchedule", fetchJraScheduleHandler);
  app.post("/api/scheduled/fetchNarSchedule", fetchNarScheduleHandler);
  app.post("/api/scheduled/fetchNarOdds", fetchNarOddsHandler);
  app.post("/api/scheduled/generateRacePredictions", generateRacePredictionsHandler);

  // 本番データ取込（レースカード・結果・払戻）
  app.post("/api/scheduled/ingestRaceCards", ingestRaceCardsHandler);
  app.post("/api/scheduled/ingestRaceResults", ingestRaceResultsHandler);
  app.post("/api/scheduled/ingestAll", runIngestionHandler);
  app.get("/api/scheduled/ingestionStatus", ingestionStatusHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startIngestionScheduler();
  });
}

startServer().catch(console.error);
