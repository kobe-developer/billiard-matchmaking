import bcrypt from "bcryptjs";
import { Elysia, t } from "elysia";
import { query } from "../lib/db";
import {
  calculateBasePoints,
  calculatePenalty,
  isValidHC,
  type HC,
} from "../lib/points";
import { authMiddleware } from "../middleware/auth";

export const staffRoutes = new Elysia({ prefix: "/api/staff" })
  .use(authMiddleware)
  .get("/players", async () => {
    const res = await query(
      `SELECT p.id, p.name, p.hc, p.points, p.win, p.lose,
              p.daily_match, p.streak, p.cooldown_until,
              a.username
       FROM players p
       JOIN accounts a ON a.id = p.account_id
       ORDER BY p.points DESC`
    );
    return { players: res.rows };
  })
  .get(
    "/players/:id",
    async ({ params, set }) => {
      const res = await query(
        `SELECT p.id, p.name, p.hc, p.points, p.win, p.lose,
                p.daily_match, p.streak, p.cooldown_until, a.username
         FROM players p JOIN accounts a ON a.id = p.account_id
         WHERE p.id = $1`,
        [params.id]
      );
      if (res.rowCount === 0) {
        set.status = 404;
        return { error: "Player tidak ditemukan" };
      }
      return res.rows[0];
    },
    { params: t.Object({ id: t.Numeric() }) }
  )
  .put(
    "/player/:id/handicap",
    async ({ params, body, set }) => {
      const { hc } = body;

      if (!isValidHC(hc)) {
        set.status = 400;
        return { error: "HC tidak valid. Pilih: 3B, 3A, 3+, 4B, 4A, 4+" };
      }

      const res = await query(
        "UPDATE players SET hc = $1 WHERE id = $2 RETURNING id, name, hc",
        [hc, params.id]
      );

      if (res.rowCount === 0) {
        set.status = 404;
        return { error: "Player tidak ditemukan" };
      }

      return { message: "HC berhasil diupdate", player: res.rows[0] };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({ hc: t.String() }),
    }
  )
  .put(
    "/player/:id/reset-limit",
    async ({ params, set }) => {
      const res = await query(
        "UPDATE players SET daily_match = 0 WHERE id = $1 RETURNING id, name",
        [params.id]
      );
      if (res.rowCount === 0) {
        set.status = 404;
        return { error: "Player tidak ditemukan" };
      }
      return { message: "Jatah match direset", player: res.rows[0] };
    },
    { params: t.Object({ id: t.Numeric() }) }
  )
  .put(
    "/player/:id/reset-password",
    async ({ params, body, set }) => {
      const { new_password } = body;

      // Ambil account_id dari player
      const playerRes = await query(
        "SELECT account_id, name FROM players WHERE id = $1",
        [params.id]
      );
      if (playerRes.rowCount === 0) {
        set.status = 404;
        return { error: "Player tidak ditemukan" };
      }

      const hashed = await bcrypt.hash(new_password, 10);
      await query("UPDATE accounts SET password = $1 WHERE id = $2", [
        hashed,
        playerRes.rows[0].account_id,
      ]);

      return {
        message: `Password ${playerRes.rows[0].name} berhasil direset`,
      };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({ new_password: t.String({ minLength: 6 }) }),
    }
  )
  .post(
    "/match/result",
    async ({ body, set }) => {
      const { player_a_id, player_b_id, winner_id } = body;

      // Validasi winner adalah salah satu dari keduanya
      if (winner_id !== player_a_id && winner_id !== player_b_id) {
        set.status = 400;
        return { error: "winner_id harus player_a_id atau player_b_id" };
      }

      // Cek match terkahir yang dari ke-2 player
      const matchSession = await query(
        `SELECT player1_id, player2_id, status FROM match_sessions
         WHERE ((player1_id = $1 AND player2_id = $2) OR (player1_id = $2 AND player2_id = $1)) AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [player_a_id, player_b_id]
      );

      if (matchSession.rowCount === 0) {
        set.status = 404;
        return { error: "Match player ini tidak ditemukan" };
      }

      // Ambil data kedua player
      const playersRes = await query(
        "SELECT id, name, hc, points, win, lose, streak FROM players WHERE id IN ($1, $2)",
        [player_a_id, player_b_id]
      );

      if (playersRes.rowCount !== 2) {
        set.status = 404;
        return { error: "Salah satu atau kedua player tidak ditemukan" };
      }

      const playerMap: Record<number, any> = {};
      for (const p of playersRes.rows) {
        playerMap[p.id] = p;
      }

      const winner = playerMap[winner_id];
      const loser_id = winner_id === player_a_id ? player_b_id : player_a_id;
      const loser = playerMap[loser_id];

      if (!winner || !loser) {
        set.status = 400;
        return { error: "Data player tidak lengkap" };
      }

      // Hitung consecutive wins winner vs loser dari history
      const historyRes = await query(
        `SELECT winner_id, player1_id, player2_id FROM match_history
         WHERE (player1_id = $1 AND player2_id = $2)
            OR (player1_id = $2 AND player2_id = $1)
         ORDER BY created_at DESC
         LIMIT 10`,
        [winner.id, loser.id]
      );

      // Hitung consecutive wins sebelum match ini
      let consecutive = 0;
      for (const m of historyRes.rows) {
        if (m.winner_id === winner.id) {
          consecutive++;
        } else {
          break;
        }
      }
      // Match ini +1
      const newConsecutive = consecutive + 1;

      // Kalkulasi poin
      const basePoints = calculateBasePoints(winner.hc as HC, loser.hc as HC);
      const penalty = calculatePenalty(newConsecutive);
      const finalPoints = basePoints - Math.abs(penalty);

      console.log({ basePoints, penalty, finalPoints });

      // Update winner
      await query(
        `UPDATE players
        SET points = points + $1, win = win + 1, streak = streak + 1
        WHERE id = $2`,
        [finalPoints, winner.id]
      );

      // Update loser (streak reset, lose++, points - basepoints)
      await query(
        `UPDATE players
        SET lose = lose + 1, streak = 0, points = points - $1
        WHERE id = $2`,
        [basePoints, loser.id]
      );

      // Update session match completed
      await query(
        `UPDATE match_sessions
        SET status = 'completed'
        WHERE (player1_id = $1 AND player2_id = $2) OR (player1_id = $2 AND player2_id = $1)`,
        [player_a_id, player_b_id]
      );

      // Simpan ke match_history
      const historyInsert = await query(
        `INSERT INTO match_history (player1_id, player2_id, winner_id, points_gained, penalty_applied)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [player_a_id, player_b_id, winner_id, finalPoints, Math.abs(penalty)]
      );

      return {
        message: "Hasil match berhasil disimpan",
        history_id: historyInsert.rows[0].id,
        winner: {
          id: winner.id,
          name: winner.name,
          points_gained: finalPoints,
          base_points: basePoints,
          penalty_applied: penalty,
          consecutive_wins_vs_opponent: newConsecutive,
        },
        loser: {
          id: loser.id,
          name: loser.name,
        },
      };
    },
    {
      body: t.Object({
        player_a_id: t.Number(),
        player_b_id: t.Number(),
        winner_id: t.Number(),
      }),
    }
  )
  .get("/match/history", async ({ query: q }) => {
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
       ORDER BY mh.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { history: res.rows, limit, offset };
  })
  .get("/match/active", async ({ query: q }) => {
    const res = await query(
      `SELECT
      a."id",
      b."id" as player1_id,
      b."name" as player1_name,
      b."avatar" as player1_avatar,
      c."id" as player2_id,
      c."name" as player2_name,
      c."avatar" as player2_avatar,
      a.created_at
      FROM
      match_sessions a
      JOIN players b ON a.player1_id = b."id"
      JOIN players c ON a.player2_id = c."id"
      WHERE a.created_at::DATE = CURRENT_DATE AND a.status = 'active'`,
    );

    return { match: res.rows };
  })
  .post("/match/cancel/:id", async ({ params, set }) => {
    var session = await query('SELECT player1_id, player2_id FROM match_sessions WHERE id = $1', [params.id]);

    if (session.rowCount === 0) {
      set.status = 404;
      return { message: 'match session tidak ditemukan' };
    }

    const player = session.rows[0];
    await query('UPDATE players SET daily_match = daily_match - 1 WHERE id IN ($1,$2)', [
      player.player1_id,
      player.player2_id,
    ]);

    await query(
      `UPDATE match_sessions SET status = 'canceled' WHERE id = $1`,
      [params.id]
    );

    return { message: 'cancel match berhasil' };
  }, {
    params: t.Object({ id: t.Numeric() }),
  })
  .put("/event/reset", async () => {
    await query("UPDATE players SET points = 0, win = 0, lose = 0, streak = 0");
    return { message: "Event reset: semua poin, win, lose, streak direset" };
  });
