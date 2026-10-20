# Kickbase-Berater (MCP-Server, nur lesen)

Kleiner Server, der Kader, Budget, Transfermarkt, Marktwertverlauf und Spielplan aus Kickbase bereitstellt. Claude nutzt ihn als Connector, auch auf dem Handy.

- Nur Lesezugriff. Es gibt kein Bieten, Verkaufen oder Aufstellen (der Test prüft das).
- Inoffizielle Kickbase-API v4. Sie kann sich jederzeit ändern.
- Dein Kickbase-Login liegt nur als geheime Umgebungsvariable bei deinem Hoster.

## Einrichtung (Netlify)

1. Projekt bei Netlify anlegen und diesen Ordner deployen.
2. Unter *Site configuration → Environment variables* eintragen (als geheim markieren):
   - `KICKBASE_EMAIL`: deine Kickbase-E-Mail
   - `KICKBASE_PASSWORD`: dein Kickbase-Passwort
   - `MCP_SECRET`: ein langer Zufallswert (mindestens 32 Zeichen)
   - optional `KICKBASE_LEAGUE_ID`: Standardliga, falls du mehrere hast
3. Neu deployen, damit die Variablen gelten.
4. In Claude unter *Einstellungen → Connectors → Eigenen Connector hinzufügen* diese URL eintragen:
   `https://DEIN-PROJEKT.netlify.app/mcp?key=DEIN_MCP_SECRET`

Wer die URL kennt, kann deine Kickbase-Daten lesen. Gib sie nicht weiter. Bei Verdacht `MCP_SECRET` ändern und die URL im Connector aktualisieren.

## Test

`npm test` startet einen Mock-Kickbase-Server und prüft Protokoll, Zugriffsschutz und Tools.

## Tools

`list_leagues`, `get_my_status`, `get_my_squad`, `get_market`, `get_player`, `get_player_market_value`, `get_player_performance`, `search_players`, `get_matchdays`, `get_competition_table`, `get_league_ranking`, `get_lineup`
