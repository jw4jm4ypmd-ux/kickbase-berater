// Minimaler MCP-Server (Streamable HTTP, ohne Sitzungen) in reinem JavaScript.
import { toolList, callTool } from "./tools.mjs";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handleRpc(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kickbase-berater", version: "1.0.0" },
        instructions:
          "Lesender Zugriff auf Kickbase (Bundesliga-Manager). Beträge sind in Euro. Es gibt keine Schreibfunktionen.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolList });
    case "tools/call": {
      try {
        const data = await callTool(params?.name, params?.arguments || {});
        return ok(id, { content: [{ type: "text", text: JSON.stringify(data) }] });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `Fehler: ${e.message}` }], isError: true });
      }
    }
    default:
      return isNotification ? null : err(id, -32601, `Methode nicht gefunden: ${method}`);
  }
}
