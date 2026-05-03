import bcrypt from "bcryptjs";
import { Elysia, t } from "elysia";
import { query } from "../lib/db";
import { jwtPlugin } from "../middleware/auth";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(jwtPlugin)
  .post(
    "/signup",
    async ({ body, set }) => {
      const { username, password, avatar } = body;

      // Cek username exist
      const existing = await query(
        "SELECT id FROM accounts WHERE username = $1",
        [username]
      );
      if (existing.rowCount! > 0) {
        set.status = 400;
        return { error: "Username sudah digunakan" };
      }

      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      // Insert ke accounts
      const accountRes = await query(
        "INSERT INTO accounts (username, password, role) VALUES ($1, $2, 'player') RETURNING id",
        [username, hashed]
      );
      const accountId = accountRes.rows[0].id;

      // Insert ke players
      const playerRes = await query(
        `INSERT INTO players (account_id, name, hc, points, win, lose, daily_match, avatar)
         VALUES ($1, $2, NULL, 100, 0, 0, 0, $3) RETURNING id`,
        [accountId, username, avatar]
      );

      return {
        message: "Akun berhasil dibuat",
        playerId: playerRes.rows[0].id,
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 50 }),
        password: t.String({ minLength: 6 }),
        avatar: t.String({ default: 'avatar/avatar-1.png' })
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const { username, password } = body;

      // Cek staff login
      if (
        username === process.env.STAFF_USERNAME &&
        password === process.env.STAFF_PASSWORD
      ) {
        const token = await jwt.sign({
          accountId: 0,
          playerId: 0,
          username: "staff",
          role: "staff",
        });
        return { token, role: "staff" };
      }

      // Player login
      const res = await query(
        `SELECT a.id as account_id, a.username, a.password, a.role,
                p.id as player_id, p.name, p.hc, p.points, p.daily_match, p.cooldown_until
         FROM accounts a
         JOIN players p ON p.account_id = a.id
         WHERE a.username = $1 AND a.role = 'player'`,
        [username]
      );

      if (res.rowCount === 0) {
        set.status = 401;
        return { error: "Username atau password salah" };
      }

      const account = res.rows[0];
      const valid = await bcrypt.compare(password, account.password);
      if (!valid) {
        set.status = 401;
        return { error: "Username atau password salah" };
      }

      const token = await jwt.sign({
        accountId: account.account_id,
        playerId: account.player_id,
        username: account.username,
        role: "player",
      });

      return {
        token,
        role: "player",
        player: {
          id: account.player_id,
          name: account.name,
          hc: account.hc,
          points: account.points,
          daily_match: account.daily_match,
          cooldown_until: account.cooldown_until,
        },
      };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    }
  );
