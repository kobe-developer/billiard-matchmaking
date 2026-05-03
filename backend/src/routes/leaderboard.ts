import { Elysia } from "elysia";
import { query } from "../lib/db";

export const leaderboardRoutes = new Elysia({ prefix: "/api" }).get(
  "/leaderboard",
  async () => {
    const res = await query(
      `SELECT p.id, p.name, p.hc, p.points, p.win, p.lose, p.avatar,
              RANK() OVER (ORDER BY p.points DESC, p.win DESC) as rank
       FROM players p
       ORDER BY p.points DESC, p.win DESC
       LIMIT 50`
    );
    return { leaderboard: res.rows, updated_at: new Date().toISOString() };
  }
);
