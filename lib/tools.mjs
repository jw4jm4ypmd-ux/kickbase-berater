// Alle Tools sind lesend. Es gibt kein Bieten, Verkaufen oder Aufstellen.
import { kbGet, resolveLeague } from "./kickbase.mjs";

const POSITIONS = { 1: "Torwart", 2: "Abwehr", 3: "Mittelfeld", 4: "Sturm" };

const leagueIdProp = {
  type: "string",
  description: "Liga-ID. Weglassen, dann wird die Standardliga genommen.",
};

function mapPlayer(p) {
  return {
    id: p.i,
    name: p.n ?? [p.fn, p.ln].filter(Boolean).join(" "),
    position: POSITIONS[p.pos] ?? p.pos,
    teamId: p.tid,
    marktwert: p.mv,
    punkteGesamt: p.p ?? p.tp,
    punkteSchnitt: p.ap,
    status: p.st, // 0 = fit, alles andere = Einschränkung (Details über get_player)
    statusListe: p.stl,
    amMarkt: p.iotm,
    ...(p.prc !== undefined ? { preis: p.prc } : {}),
    ...(p.dt ? { marktEnde: p.dt } : {}),
    // Weitere Rohfelder der API (Kürzel), falls nötig:
    weitere: Object.fromEntries(
      Object.entries(p).filter(
        ([k]) => !["i", "n", "fn", "ln", "pos", "tid", "mv", "p", "tp", "ap", "st", "stl", "iotm", "pim", "prc", "dt"].includes(k)
      )
    ),
  };
}

const tools = [
  {
    name: "list_leagues",
    description: "Listet die Kickbase-Ligen des Nutzers mit Liga-ID und Wettbewerbs-ID.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const sel = await kbGet("/v4/leagues/selection");
      return (sel.it || []).map((l) => ({ id: l.i, name: l.n, wettbewerbsId: l.cpi, manager: l.un, rang: l.rnkm }));
    },
  },
  {
    name: "get_my_status",
    description: "Budget und Status des Nutzers in der Liga (Budget in Euro, Teamwert, Platzierung).",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      const [me, budget] = await Promise.all([
        kbGet(`/v4/leagues/${lg.leagueId}/me`),
        kbGet(`/v4/leagues/${lg.leagueId}/me/budget`),
      ]);
      return { liga: lg.name, ligaId: lg.leagueId, budget: budget.b, budgetStatus: budget.bs, me };
    },
  },
  {
    name: "get_my_squad",
    description:
      "Eigener Kader mit Position, Marktwert, Punkten, Durchschnitt, Status (0 = fit) und ob der Spieler am Markt ist.",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      const squad = await kbGet(`/v4/leagues/${lg.leagueId}/squad`);
      return { liga: lg.name, spieler: (squad.it || []).map(mapPlayer) };
    },
  },
  {
    name: "get_market",
    description: "Aktueller Transfermarkt der Liga: Spieler, Preis, Marktwert, Ablaufzeit.",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      const m = await kbGet(`/v4/leagues/${lg.leagueId}/market`);
      return {
        liga: lg.name,
        spieltag: m.day,
        marktwertUpdate: m.mvud,
        naechsterSpieltagBeginn: m.dt,
        spieler: (m.it || []).map(mapPlayer),
      };
    },
  },
  {
    name: "get_player",
    description: "Details zu einem Spieler (Status, Punkte, Marktwert, Verein).",
    inputSchema: {
      type: "object",
      properties: { leagueId: leagueIdProp, playerId: { type: "string" } },
      required: ["playerId"],
    },
    run: async ({ leagueId, playerId }) => {
      const lg = await resolveLeague(leagueId);
      return kbGet(`/v4/leagues/${lg.leagueId}/players/${encodeURIComponent(playerId)}`);
    },
  },
  {
    name: "get_player_market_value",
    description:
      "Marktwertverlauf eines Spielers der letzten N Tage (Standard 30). Zeigt Trend, Hoch und Tief.",
    inputSchema: {
      type: "object",
      properties: {
        leagueId: leagueIdProp,
        playerId: { type: "string" },
        days: { type: "integer", description: "Zeitraum in Tagen (Standard 30)" },
      },
      required: ["playerId"],
    },
    run: async ({ leagueId, playerId, days = 30 }) => {
      const lg = await resolveLeague(leagueId);
      const r = await kbGet(
        `/v4/leagues/${lg.leagueId}/players/${encodeURIComponent(playerId)}/marketValue/${Number(days) || 30}`
      );
      return { verlauf: r.it, tiefsterWert: r.lmv, hoechsterWert: r.hmv, rohdaten: { trp: r.trp, prlo: r.prlo } };
    },
  },
  {
    name: "get_player_performance",
    description: "Punkte pro Spieltag eines Spielers in dieser Saison.",
    inputSchema: {
      type: "object",
      properties: { leagueId: leagueIdProp, playerId: { type: "string" } },
      required: ["playerId"],
    },
    run: async ({ leagueId, playerId }) => {
      const lg = await resolveLeague(leagueId);
      return kbGet(`/v4/leagues/${lg.leagueId}/players/${encodeURIComponent(playerId)}/performance`);
    },
  },
  {
    name: "search_players",
    description: "Sucht Bundesliga-Spieler nach Namen (z. B. für Marktwert oder Form).",
    inputSchema: {
      type: "object",
      properties: { leagueId: leagueIdProp, query: { type: "string" } },
      required: ["query"],
    },
    run: async ({ leagueId, query }) => {
      const lg = await resolveLeague(leagueId);
      const r = await kbGet(`/v4/competitions/${lg.competitionId}/players/search`, {
        leagueId: lg.leagueId,
        query,
        start: 0,
        max: 20,
      });
      return (r.it || []).map(mapPlayer);
    },
  },
  {
    name: "get_matchdays",
    description: "Spielplan und Ergebnisse der Saison. Optional nur ein bestimmter Spieltag.",
    inputSchema: {
      type: "object",
      properties: { leagueId: leagueIdProp, day: { type: "integer", description: "Spieltag (optional)" } },
    },
    run: async ({ leagueId, day }) => {
      const lg = await resolveLeague(leagueId);
      const r = await kbGet(`/v4/competitions/${lg.competitionId}/matchdays`);
      const days = r.it || [];
      return day ? days.filter((d) => d.day === Number(day)) : days;
    },
  },
  {
    name: "get_competition_table",
    description: "Bundesliga-Tabelle.",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      return kbGet(`/v4/competitions/${lg.competitionId}/table`);
    },
  },
  {
    name: "get_league_ranking",
    description: "Rangliste der eigenen Kickbase-Liga.",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      return kbGet(`/v4/leagues/${lg.leagueId}/ranking`);
    },
  },
  {
    name: "get_lineup",
    description: "Aktuelle Aufstellung des Nutzers (nur lesen, keine Änderung).",
    inputSchema: { type: "object", properties: { leagueId: leagueIdProp } },
    run: async ({ leagueId }) => {
      const lg = await resolveLeague(leagueId);
      return kbGet(`/v4/leagues/${lg.leagueId}/lineup/overview`);
    },
  },
];

export const toolList = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export async function callTool(name, args = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unbekanntes Tool: ${name}`);
  return tool.run(args);
}
