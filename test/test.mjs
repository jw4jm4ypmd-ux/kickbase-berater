// Lokaler Test mit einem Mock-Kickbase-Server. Kein Netzwerk nach außen nötig.
import http from "node:http";
import assert from "node:assert/strict";

const calls = [];
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ method: req.method, path: req.url.split("?")[0], auth: req.headers.authorization });
    const send = (o, s = 200) => {
      res.writeHead(s, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    const p = req.url.split("?")[0];
    if (p === "/v4/user/login") return send({ tkn: "TESTTOKEN" });
    if (req.headers.authorization !== "Bearer TESTTOKEN") return send({}, 401);
    if (p === "/v4/leagues/selection")
      return send({ it: [{ i: "1234", n: "Testliga", cpi: "1", un: 5, rnkm: 2 }], anol: 1 });
    if (p === "/v4/leagues/1234/squad")
      return send({ it: [{ i: "118", n: "Grifo", pos: 3, tid: "5", mv: 10973197, p: 1659, ap: 72, st: 0, stl: [], iotm: false, tfhmvt: 32460 }] });
    if (p === "/v4/leagues/1234/me/budget") return send({ b: 58818981, bs: 1 });
    if (p === "/v4/leagues/1234/me") return send({ b: 58818981, tpc: 15 });
    if (p === "/v4/leagues/1234/market") return send({ it: [{ i: "9", n: "Kane", pos: 4, mv: 1, prc: 2 }], day: 24 });
    if (p === "/v4/leagues/1234/players/118/marketValue/30") return send({ it: [{ dt: 1, mv: 5 }], lmv: 1, hmv: 9 });
    if (p === "/v4/competitions/1/matchdays") return send({ it: [{ day: 1, it: [] }, { day: 2, it: [] }] });
    return send({ error: "unbekannt " + p }, 404);
  });
});
await new Promise((r) => mock.listen(0, r));
process.env.KICKBASE_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
process.env.KICKBASE_EMAIL = "test@example.com";
process.env.KICKBASE_PASSWORD = "geheim";
process.env.MCP_SECRET = "s3cret";

const { default: handler } = await import("../netlify/functions/mcp.mjs");
const rpc = async (body, key = "s3cret") => {
  const res = await handler(
    new Request(`http://localhost/mcp?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: res.status === 202 ? null : await res.json() };
};

// Schlüssel im Pfad funktioniert ebenfalls
const viaPath = await handler(
  new Request("http://localhost/mcp/s3cret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  })
);
assert.equal(viaPath.status, 200);
const wrongPath = await handler(
  new Request("http://localhost/mcp/falsch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  })
);
assert.equal(wrongPath.status, 401);

// Zugriffsschutz
assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "falsch")).status, 401);
process.env.MCP_SECRET = "";
assert.equal((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "")).status, 401);
process.env.MCP_SECRET = "s3cret";

// Protokoll
const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
assert.equal(init.json.result.serverInfo.name, "kickbase-berater");
assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
const names = list.json.result.tools.map((t) => t.name);
for (const forbidden of ["place_offer", "sell_player", "set_lineup", "fill_lineup"]) {
  assert.ok(!names.includes(forbidden), `Schreib-Tool ${forbidden} darf nicht existieren`);
}

const call = async (name, args = {}) => {
  const r = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
  assert.ok(!r.json.result.isError, r.json.result.content[0].text);
  return JSON.parse(r.json.result.content[0].text);
};

const squad = await call("get_my_squad");
assert.equal(squad.spieler[0].name, "Grifo");
assert.equal(squad.spieler[0].position, "Mittelfeld");
assert.equal(squad.spieler[0].weitere.tfhmvt, 32460);
assert.equal((await call("get_my_status")).budget, 58818981);
assert.equal((await call("get_market")).spieler[0].preis, 2);
assert.equal((await call("get_player_market_value", { playerId: "118" })).hoechsterWert, 9);
assert.equal((await call("get_matchdays", { day: 2 })).length, 1);
assert.equal((await call("list_leagues"))[0].name, "Testliga");

// Fehler werden als Tool-Fehler zurückgegeben, nicht als Absturz
const bad = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_player", arguments: { playerId: "nix" } } });
assert.equal(bad.json.result.isError, true);

// Nur Lesezugriffe (Login ist die einzige POST-Anfrage)
const writes = calls.filter((c) => c.method !== "GET" && c.path !== "/v4/user/login");
assert.equal(writes.length, 0, "Es dürfen keine Schreibanfragen an Kickbase gehen");
assert.equal(calls.filter((c) => c.path === "/v4/user/login").length, 1, "Login nur einmal (Token wird gemerkt)");

console.log("Alle Tests bestanden.");
mock.close();
