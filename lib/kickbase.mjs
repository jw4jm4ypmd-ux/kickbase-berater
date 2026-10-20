// Schreibgeschützter Kickbase-Client (inoffizielle API v4).
// Es gibt bewusst nur GET-Anfragen. Die einzige Ausnahme ist der Login (POST).

const BASE_URL = process.env.KICKBASE_BASE_URL || "https://api.kickbase.com";

// Token bleibt im Speicher der Funktionsinstanz. Bei Kaltstart wird neu eingeloggt.
let cachedToken = null;
let cachedAt = 0;
const TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000; // vorsichtshalber alle 6 Stunden neu einloggen

async function login() {
  const email = process.env.KICKBASE_EMAIL;
  const pass = process.env.KICKBASE_PASSWORD;
  if (!email || !pass) {
    throw new Error("KICKBASE_EMAIL und KICKBASE_PASSWORD sind nicht gesetzt.");
  }
  const res = await fetch(`${BASE_URL}/v4/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ em: email, pass, loy: false, rep: {} }),
  });
  if (!res.ok) {
    throw new Error(`Kickbase-Login fehlgeschlagen (HTTP ${res.status}).`);
  }
  const data = await res.json();
  if (!data.tkn) throw new Error("Kickbase-Login lieferte kein Token.");
  cachedToken = data.tkn;
  cachedAt = Date.now();
  return cachedToken;
}

async function getToken() {
  if (process.env.KICKBASE_TOKEN && !cachedToken) return process.env.KICKBASE_TOKEN;
  if (cachedToken && Date.now() - cachedAt < TOKEN_MAX_AGE_MS) return cachedToken;
  return login();
}

export async function kbGet(path, query = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken();
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 401 && attempt === 0) {
      cachedToken = null; // Token abgelaufen: neu einloggen und noch einmal versuchen
      if (process.env.KICKBASE_EMAIL) continue;
    }
    if (!res.ok) throw new Error(`Kickbase antwortete mit HTTP ${res.status} für ${url.pathname}.`);
    return res.json();
  }
  throw new Error("Kickbase-Anfrage fehlgeschlagen.");
}

// Liga-Auswahl: explizit angegeben, aus der Umgebung oder die erste Liga des Nutzers.
export async function resolveLeague(leagueId) {
  const sel = await kbGet("/v4/leagues/selection");
  const leagues = sel.it || [];
  if (leagues.length === 0) throw new Error("Keine Kickbase-Liga gefunden.");
  const wanted = leagueId || process.env.KICKBASE_LEAGUE_ID;
  const league = wanted ? leagues.find((l) => String(l.i) === String(wanted)) : leagues[0];
  if (!league) {
    throw new Error(
      `Liga ${wanted} nicht gefunden. Verfügbar: ${leagues.map((l) => `${l.n} (${l.i})`).join(", ")}`
    );
  }
  return { leagueId: String(league.i), competitionId: String(league.cpi), name: league.n, leagues };
}
