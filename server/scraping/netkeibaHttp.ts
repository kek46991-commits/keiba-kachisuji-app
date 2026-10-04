/**
 * netkeiba系サイトへのHTTP取得。失敗理由（HTTPステータス / タイムアウト / 空レスポンス）を
 * そのままログに残し、呼び出し側がデモデータへ落ちずに「取得失敗」を判別できるようにする。
 */

export type ScrapeFailureKind = "http_error" | "network_error" | "empty_body" | "parse_error";

export class ScrapeError extends Error {
  readonly kind: ScrapeFailureKind;
  readonly url: string;
  readonly status: number | null;

  constructor(kind: ScrapeFailureKind, url: string, message: string, status: number | null = null) {
    super(message);
    this.name = "ScrapeError";
    this.kind = kind;
    this.url = url;
    this.status = status;
  }
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, options: { referer?: string; timeoutMs?: number } = {}): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
  };
  if (options.referer) headers.Referer = options.referer;

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(options.timeoutMs ?? 20000) });
  } catch (error) {
    throw new ScrapeError("network_error", url, `ネットワークエラー: ${String(error)}`);
  }

  if (!response.ok) {
    throw new ScrapeError("http_error", url, `HTTP ${response.status} ${response.statusText}`, response.status);
  }

  const body = await response.text();
  if (body.trim() === "") {
    throw new ScrapeError("empty_body", url, "レスポンス本文が空でした", response.status);
  }
  return body;
}

export function describeScrapeError(error: unknown): string {
  if (error instanceof ScrapeError) {
    return `[${error.kind}${error.status === null ? "" : ` status=${error.status}`}] ${error.url} :: ${error.message}`;
  }
  return String(error);
}
