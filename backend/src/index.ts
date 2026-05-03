import { cors } from "@elysiajs/cors";
import "dotenv/config";
import { Elysia } from "elysia";

import { startAllJobs } from "./jobs/scheduler";
import { authRoutes } from "./routes/auth";
import { leaderboardRoutes } from "./routes/leaderboard";
import { matchRoutes } from "./routes/match";
import { staffRoutes } from "./routes/staff";

const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
    })
  )

  // Health check
  .get("/", () => ({
    status: "ok",
    service: "Billiard Pointer API",
    timestamp: new Date().toISOString(),
  }))

  // Routes
  .use(authRoutes)
  .use(matchRoutes)
  .use(staffRoutes)
  .use(leaderboardRoutes)

  // Global error handler
  .onError(({ code, error, set }) => {
    console.error(`[ERROR] ${code}:`, error);

    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Data tidak valid", detail: error.message };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Endpoint tidak ditemukan" };
    }

    set.status = 500;
    return { error: "Internal server error" };
  })

  .listen(Number(process.env.PORT) || 3000);

// Start background jobs
startAllJobs();

console.log(`🎱 Billiard Pointer API berjalan di http://localhost:${app.server?.port}`);

export type App = typeof app;
