import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MlKnowledgeSource } from "../src/knowledge/ml-knowledge.source.js";

/** A stand-in for the ML service's POST /rag/search. */
let server: Server;
let base = "";
const received: unknown[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: { passages: [] } };

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({ url: req.url, method: req.method, body: JSON.parse(raw || "{}") });
      res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("MlKnowledgeSource (calls the ML service's /rag/search)", () => {
  it("sends only the line's name and the question, and maps the passages", async () => {
    reply = {
      status: 200,
      body: { passages: [{ id: "generation", title: "Generation Charge", text: "Pass-through.", source: "https://www.meralco.com.ph/residential/understand-your-bill", score: 101 }] },
    };
    const out = await new MlKnowledgeSource(base).search({ lineLabel: "Generation", question: "Bakit tumaas?" });
    expect(out).toEqual([{ title: "Generation Charge", text: "Pass-through.", url: "https://www.meralco.com.ph/residential/understand-your-bill" }]);
    expect(received.at(-1)).toEqual({ url: "/rag/search", method: "POST", body: { lineLabel: "Generation", question: "Bakit tumaas?", k: 2 } });
  });

  it("drops passages that do not link to meralco.com.ph", async () => {
    reply = { status: 200, body: { passages: [{ title: "x", text: "y", source: "https://example.com/" }] } };
    expect(await new MlKnowledgeSource(base).search({ lineLabel: "Generation", question: "?" })).toEqual([]);
  });

  it("returns no passages, never an error, when the service fails or is down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = { status: 500, body: { detail: "boom" } };
    expect(await new MlKnowledgeSource(base).search({ lineLabel: "Generation", question: "?" })).toEqual([]);
    expect(await new MlKnowledgeSource("http://127.0.0.1:1").search({ lineLabel: "Generation", question: "?" })).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
