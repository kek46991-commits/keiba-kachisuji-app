import type { Express, Response } from "express";
import { ENV } from "./env";
import { storagePlaceholderSvg } from "./storagePlaceholder";

function sendPlaceholder(res: Response, key: string) {
  res.status(200).type("image/svg+xml").set("Cache-Control", "public, max-age=300").send(storagePlaceholderSvg(key));
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      sendPlaceholder(res, key);
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        sendPlaceholder(res, key);
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        sendPlaceholder(res, key);
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      sendPlaceholder(res, key);
    }
  });
}
