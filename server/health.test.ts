import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { healthHandler, registerHealthRoutes } from "./health";

function createResponse() {
  const json = vi.fn();
  const res = {
    status: vi.fn().mockReturnValue({ json, end: vi.fn() }),
  };
  return { res: res as unknown as Response, status: res.status, json };
}

describe("healthHandler", () => {
  it("returns 200 with ok status and no database access", () => {
    const { res, status, json } = createResponse();
    healthHandler({} as Request, res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0]?.[0]).toMatchObject({ status: "ok" });
    expect(typeof json.mock.calls[0]?.[0].uptimeSeconds).toBe("number");
  });
});

describe("registerHealthRoutes", () => {
  it("registers GET and HEAD routes for both paths", () => {
    const get = vi.fn();
    const head = vi.fn();
    registerHealthRoutes({ get, head } as never);
    expect(get.mock.calls.map(call => call[0])).toEqual(["/api/health", "/healthz"]);
    expect(head.mock.calls.map(call => call[0])).toEqual(["/api/health", "/healthz"]);
  });
});
