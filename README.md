# What Beats That?! — Phase 1

A browser-based multiplayer party game. One player creates a room and shares its six-character code. Friends join on phones or computers without accounts. Players submit answers, vote for the best combination of humor, creativity and logic, and see the winning answer become the next challenge.

## Run locally

Requires Node.js 20 or later.

```bash
npm install
npm start
```

Visit http://localhost:3000. Open two tabs to try a match. Each tab gets a separate session. To test from a phone on the same Wi-Fi, find your computer's local IP address and open `http://YOUR-COMPUTER-IP:3000` on the phone (your firewall may require allowing port 3000). This is not yet a public deployment.

## Game rules

- 2–10 players; 7 rounds.
- 20 seconds to submit an answer, 15 seconds to vote, 6.5 seconds to see the winner.
- Players can't vote for their own answer, and duplicate submissions in the same round are rejected.
- Each vote received earns 1 point. Winning the round earns 2 extra points.
- Tied round-winning answers are resolved randomly. Tied match leaders share the win.
- The winning answer becomes the next round's challenge. If nobody submits, the prompt remains unchanged.
- Rooms and scores live in server memory; restarting the server clears them. A reconnecting player can resume a session while the room is active.

## Technology

Node.js, Express, Socket.IO, vanilla JavaScript, HTML and CSS. The server owns timers, answers, voting validation, scoring and game phases. A player session token is stored in the browser's sessionStorage to reconnect after refreshing.

## Phase 1 limitations / testing

- Not deployed to a public host yet.
- Rooms are stored in one Node.js process; multi-instance hosting would require shared state and a Socket.IO adapter.
- Empty/offline rooms are removed. Offline players remain on the roster while at least one player stays connected.
- Moderation, reactions, animated battles, spectator mode and persistent accounts are outside Phase 1.
- Please test a full seven-round match on at least two real devices before treating the build as release-ready.

## Phase 2 additions
- Live Socket.IO emoji reactions during voting and reveal (server validates emojis, player session, and a 650 ms cooldown).
- Animated answer-versus-challenge battle during reveal, with reduced-motion support.
- Optional short synthesized impact sound with persistent mute toggle.
- No new dependencies. Run `npm install` then `npm start` as before.
- Reactions are cosmetic and do not affect voting or scoring.
