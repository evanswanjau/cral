import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("GET /healthz", () => {
  it("returns 200 with a correctly shaped body, no DB dependency", async () => {
    const app = createApp();
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["cral-request-id"]).toMatch(/^req_/);
  });
});

describe("GET /does-not-exist", () => {
  it("returns the shared error envelope shape", async () => {
    const app = createApp();
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      type: "not_found",
      code: "route_not_found",
    });
    expect(res.body.error.request_id).toMatch(/^req_/);
  });
});
