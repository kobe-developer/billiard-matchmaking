import { Elysia, t } from "elysia";
import { query } from "../lib/db";
import { parseUserBearerToken } from "../lib/utils";
import { authMiddleware } from "../middleware/auth";

const READY_TIMEOUT_SECONDS = 40;
const DAILY_MATCH_LIMIT = 3;

export const matchRoutes = new Elysia({ prefix: "/api/match" })
  .use(authMiddleware)
  .post("/fight", async ({ set, jwt, bearer }) => {
    const user = await parseUserBearerToken(jwt, bearer);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const playerId = user.playerId;

    // Ambil data player
    const playerRes = await query(
      "SELECT id, daily_match, cooldown_until FROM players WHERE id = $1",
      [playerId]
    );
    if (playerRes.rowCount === 0) {
      set.status = 404;
      return { error: "Player tidak ditemukan" };
    }

    const player = playerRes.rows[0];

    // Cek cooldown
    if (player.cooldown_until && new Date(player.cooldown_until) > new Date()) {
      set.status = 429;
      return {
        error: "Sedang cooldown",
        cooldown_until: player.cooldown_until,
      };
    }

    // Cek daily limit
    if (player.daily_match >= DAILY_MATCH_LIMIT) {
      set.status = 429;
      return { error: "Jatah match harian sudah habis (maks 3x)" };
    }

    // Cek apakah player sudah ada di session aktif
    const existingSession = await query(
      `SELECT id, status FROM match_sessions
       WHERE (player1_id = $1 OR player2_id = $1)
         AND status IN ('queue', 'waiting_ready', 'active')
       LIMIT 1`,
      [playerId]
    );
    if (existingSession.rowCount! > 0) {
      set.status = 400;
      return {
        error: "Kamu sudah dalam antrian atau match aktif",
        session_id: existingSession.rows[0].id,
        status: existingSession.rows[0].status,
      };
    }

    // Cari antrean yang tersedia (bukan milik diri sendiri)
    const queueRes = await query(
      `SELECT id FROM match_sessions
       WHERE status = 'queue'
         AND player1_id != $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [playerId]
    );

    if (queueRes.rowCount! > 0) {
      // Gabung ke session yang ada
      const sessionId = queueRes.rows[0].id;
      const expiresAt = new Date(Date.now() + READY_TIMEOUT_SECONDS * 1000);

      await query(
        `UPDATE match_sessions
         SET player2_id = $1, status = 'waiting_ready', expires_at = $2
         WHERE id = $3`,
        [playerId, expiresAt, sessionId]
      );

      return {
        status: "waiting_ready",
        session_id: sessionId,
        message: "Lawan ditemukan! Klik READY dalam 40 detik",
        expires_at: expiresAt,
      };
    } else {
      // Buat antrean baru
      const newSession = await query(
        `INSERT INTO match_sessions (player1_id, status)
         VALUES ($1, 'queue') RETURNING id`,
        [playerId]
      );

      return {
        status: "queue",
        session_id: newSession.rows[0].id,
        message: "Sedang mencari lawan...",
      };
    }
  })
  .post(
    "/ready",
    async ({ body, jwt, bearer, set }) => {
      const user = await parseUserBearerToken(jwt, bearer);

      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const playerId = user.playerId;
      const { session_id } = body;

      // Ambil session
      const sessionRes = await query(
        `SELECT * FROM match_sessions WHERE id = $1`,
        [session_id]
      );

      if (sessionRes.rowCount === 0) {
        set.status = 404;
        return { error: "Session tidak ditemukan" };
      }

      const session = sessionRes.rows[0];

      if (session.status !== "waiting_ready") {
        set.status = 400;
        return { error: `Status session tidak valid: ${session.status}` };
      }

      // Cek apakah player ada di session ini
      const isPlayer1 = session.player1_id === playerId;
      const isPlayer2 = session.player2_id === playerId;

      if (!isPlayer1 && !isPlayer2) {
        set.status = 403;
        return { error: "Kamu tidak ada di session ini" };
      }

      // Cek timeout
      if (new Date(session.expires_at) < new Date()) {
        set.status = 400;
        return { error: "Waktu ready sudah habis" };
      }

      // Update ready status
      const field = isPlayer1 ? "player1_ready" : "player2_ready";
      await query(
        `UPDATE match_sessions SET ${field} = TRUE WHERE id = $1`,
        [session_id]
      );

      // Cek apakah keduanya sudah ready
      const updatedRes = await query(
        `SELECT player1_ready, player2_ready FROM match_sessions WHERE id = $1`,
        [session_id]
      );
      const updated = updatedRes.rows[0];

      const bothReady =
        (isPlayer1 ? true : session.player1_ready) &&
        (isPlayer2 ? true : session.player2_ready);

      if (bothReady || (updated.player1_ready && updated.player2_ready)) {
        // Keduanya ready -> set active & increment daily_match
        await query(
          `UPDATE match_sessions SET status = 'active' WHERE id = $1`,
          [session_id]
        );
        await query(
          `UPDATE players SET daily_match = daily_match + 1
           WHERE id IN ($1, $2)`,
          [session.player1_id, session.player2_id]
        );

        return {
          status: "active",
          message: "Match dikonfirmasi! Silakan bermain offline.",
        };
      }

      return {
        status: "waiting_ready",
        message: "Ready! Menunggu lawan...",
      };
    },
    {
      body: t.Object({
        session_id: t.Number(),
      }),
    }
  )
  .get("/status", async ({ set, jwt, bearer }) => {
    const user = await parseUserBearerToken(jwt, bearer);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const playerId = user.playerId;

    const sessionRes = await query(
      `SELECT ms.id, ms.status, ms.expires_at,
              ms.player1_ready, ms.player2_ready,
              ms.player1_id, ms.player2_id,
              p1.name as player1_name,
              p2.name as player2_name
       FROM match_sessions ms
       LEFT JOIN players p1 ON p1.id = ms.player1_id
       LEFT JOIN players p2 ON p2.id = ms.player2_id
       WHERE (ms.player1_id = $1 OR ms.player2_id = $1)
         AND ms.status IN ('queue', 'waiting_ready', 'active')
       LIMIT 1`,
      [playerId]
    );

    if (sessionRes.rowCount === 0) {
      return { status: "idle" };
    }

    const s = sessionRes.rows[0];
    const isPlayer1 = s.player1_id === playerId;

    return {
      status: s.status,
      session_id: s.id,
      expires_at: s.expires_at,
      my_ready: isPlayer1 ? s.player1_ready : s.player2_ready,
      opponent_ready: isPlayer1 ? s.player2_ready : s.player1_ready,
      opponent_name: isPlayer1 ? s.player2_name : s.player1_name,
    };
  })
  .post(
    "/cancel",
    async ({ body, set, jwt, bearer }) => {
      const user = await parseUserBearerToken(jwt, bearer);

      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const playerId = user.playerId;
      const { session_id } = body;

      const sessionRes = await query(
        `SELECT * FROM match_sessions WHERE id = $1 AND status = 'queue'`,
        [session_id]
      );

      if (sessionRes.rowCount === 0) {
        set.status = 400;
        return { error: "Session tidak ditemukan atau tidak bisa dibatalkan" };
      }

      const session = sessionRes.rows[0];
      if (session.player1_id !== playerId) {
        set.status = 403;
        return { error: "Bukan antrian kamu" };
      }

      await query(
        `UPDATE match_sessions SET status = 'canceled' WHERE id = $1`,
        [session_id]
      );

      return { message: "Antrian dibatalkan" };
    },
    {
      body: t.Object({
        session_id: t.Number(),
      }),
    }
  )
  .get("/me", async ({ set, bearer, jwt }) => {
    const user = await parseUserBearerToken(jwt, bearer);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    await query('update players set last_seen = now() where id = $1', [user.playerId]);
    const res = await query(
      `SELECT p.id, p.name, p.hc, p.points, p.win, p.lose,
              p.daily_match, p.streak, p.cooldown_until
       FROM players p
       WHERE p.id = $1`,
      [user!.playerId]
    );

    if (res.rowCount === 0) return { error: "Player tidak ditemukan" };
    return res.rows[0];
  })
  .get("/history", async ({ query: q, bearer, jwt, set }) => {
    const user = await parseUserBearerToken(jwt, bearer);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const limit = Math.min(Number(q.limit) || 50, 100);
    const offset = Number(q.offset) || 0;

    const res = await query(
      `SELECT mh.id, mh.created_at, mh.points_gained, mh.penalty_applied,
              p1.name as player1_name, p1.hc as player1_hc,
              p2.name as player2_name, p2.hc as player2_hc,
              pw.name as winner_name
       FROM match_history mh
       JOIN players p1 ON p1.id = mh.player1_id
       JOIN players p2 ON p2.id = mh.player2_id
       LEFT JOIN players pw ON pw.id = mh.winner_id
       WHERE p1.id = $3 OR p2.id = $3
       ORDER BY mh.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, user.playerId]
    );

    return { history: res.rows, limit, offset };
  })
  .get("/active", async ({ set, bearer, jwt }) => {
    const user = await parseUserBearerToken(jwt, bearer);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const res = await query(
      `SELECT * FROM match_sessions WHERE ((player1_id = $1) OR (player2_id = $1)) AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
      `,
      [user!.playerId]
    );

    return { status: res.rowCount === 0 ? null : "active" };
  });
