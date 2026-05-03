// ============================================================
// POINT SYSTEM
// Formula: 20 ± (3 × level_diff)
// ============================================================

export type HC = "3B" | "3A" | "3+" | "4B" | "4A" | "4+";

const HC_ORDER: Record<HC, number> = {
   "3B": 0,
   "3A": 1,
   "3+": 2,
   "4B": 3,
   "4A": 4,
   "4+": 5,
};

// Matrix poin menang: POINT_MATRIX[winner_hc][loser_hc]
export const POINT_MATRIX: Record<HC, Record<HC, number>> = {
   "3B": { "3B": 20, "3A": 23, "3+": 26, "4B": 29, "4A": 32, "4+": 35 },
   "3A": { "3B": 17, "3A": 20, "3+": 23, "4B": 26, "4A": 29, "4+": 32 },
   "3+": { "3B": 14, "3A": 17, "3+": 20, "4B": 23, "4A": 26, "4+": 29 },
   "4B": { "3B": 11, "3A": 14, "3+": 17, "4B": 20, "4A": 23, "4+": 26 },
   "4A": { "3B": 8, "3A": 11, "3+": 14, "4B": 17, "4A": 20, "4+": 23 },
   "4+": { "3B": 5, "3A": 8, "3+": 11, "4B": 14, "4A": 17, "4+": 20 },
};

/**
 * Hitung poin yang didapat pemenang
 * @param winnerHC  - HC pemenang
 * @param loserHC   - HC yang kalah
 * @returns base points before penalty
 */
export function calculateBasePoints(winnerHC: HC | null, loserHC: HC | null): number {
   // Jika salah satu belum punya HC, gunakan nilai default 20
   if (!winnerHC || !loserHC) return 20;
   return POINT_MATRIX[winnerHC][loserHC];
}

// ============================================================
// PENALTY SYSTEM - berdasarkan consecutive wins vs lawan yg sama
// ============================================================

/**
 * Tabel penalti berdasarkan jumlah menang berturut vs lawan yang sama
 * Reset jika lawan sempat menang 1x
 */
const PENALTY_TABLE: Record<number, number> = {
   1: 0,
   2: 0,
   3: -2,
   4: -4,
   5: -6,
};

/**
 * Hitung penalti berdasarkan consecutive wins vs lawan spesifik
 * @param consecutiveWins - jumlah menang berturut vs lawan ini
 * @returns penalty amount (negatif atau 0)
 */
export function calculatePenalty(consecutiveWins: number): number {
   if (consecutiveWins <= 2) return 0;
   if (consecutiveWins >= 5) return -6;
   return PENALTY_TABLE[consecutiveWins] ?? 0;
}

/**
 * Hitung consecutive wins player A vs player B dari match_history
 * (hanya dari match_history yang sudah ada di DB, dikirim sebagai param)
 */
export function getConsecutiveWins(
   history: Array<{ winner_id: number; player1_id: number; player2_id: number }>,
   winnerId: number,
   opponentId: number
): number {
   // Filter match antara kedua player, urutkan dari terbaru
   const relevantMatches = history
      .filter(
         (m) =>
            (m.player1_id === winnerId && m.player2_id === opponentId) ||
            (m.player1_id === opponentId && m.player2_id === winnerId)
      )
      .reverse(); // history sudah DESC dari DB, reverse agar index 0 = paling lama

   let consecutive = 0;
   for (const match of relevantMatches) {
      if (match.winner_id === winnerId) {
         consecutive++;
      } else {
         break; // lawan sempat menang, reset
      }
   }
   return consecutive;
}

export const HC_LIST: HC[] = ["3B", "3A", "3+", "4B", "4A", "4+"];

export function isValidHC(hc: string): hc is HC {
   return HC_LIST.includes(hc as HC);
}
