import { query } from "../lib/db";

// ============================================================
// JOB 1: Daily Limit Reset (00:00 WIB / UTC+7)
// Runs every minute, triggers at 17:00 UTC = 00:00 WIB
// ============================================================
export function startDailyResetJob() {
  console.log("⏰ Daily reset job started");

  setInterval(async () => {
    const now = new Date();
    // WIB = UTC+7, jam 00:00 WIB = 17:00 UTC sehari sebelumnya
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    if (utcHour === 17 && utcMinute === 0) {
      try {
        const res = await query("UPDATE players SET daily_match = 0");
        console.log(
          `[CRON] Daily reset: ${res.rowCount} players direset jam ${now.toISOString()}`
        );
      } catch (err) {
        console.error("[CRON] Daily reset error:", err);
      }
    }
  }, 60 * 1000); // cek setiap menit
}

// ============================================================
// JOB 2: Timeout Sweeper (setiap 5 detik)
// Batalkan match_sessions yang waiting_ready tapi expired
// ============================================================
export function startTimeoutSweeper() {
  console.log("⏰ Timeout sweeper started");

  setInterval(async () => {
    try {
      // Ambil session yang expired
      const expiredRes = await query(
        `SELECT id, player1_id, player2_id, player1_ready, player2_ready
        FROM match_sessions
        WHERE status = 'waiting_ready'
        AND expires_at < NOW()`
      );

      if (expiredRes.rowCount === 0) return;

      for (const session of expiredRes.rows) {
        // Batalkan session
        await query(
          "UPDATE match_sessions SET status = 'canceled' WHERE id = $1",
          [session.id]
        );

        const cooldownUntil = new Date(Date.now() + 60 * 1000); // +1 menit

        // Berikan cooldown ke player yang TIDAK ready
        if (!session.player1_ready) {
          await query(
            "UPDATE players SET cooldown_until = $1 WHERE id = $2",
            [cooldownUntil, session.player1_id]
          );
          console.log(
            `[SWEEP] Player ${session.player1_id} cooldown (tidak ready)`
          );
        }

        if (!session.player2_ready && session.player2_id) {
          await query(
            "UPDATE players SET cooldown_until = $1 WHERE id = $2",
            [cooldownUntil, session.player2_id]
          );
          console.log(
            `[SWEEP] Player ${session.player2_id} cooldown (tidak ready)`
          );
        }
      }
    } catch (err) {
      console.error("[SWEEP] Timeout sweeper error:", err);
    }
  }, 5000); // cek setiap 5 detik
}

// ============================================================
// Start semua background jobs
// ============================================================
export function startAllJobs() {
  startDailyResetJob();
  startTimeoutSweeper();
  console.log("✅ All background jobs running");
}
