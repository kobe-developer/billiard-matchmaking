# 🎱 Billiard Pointer — Full Setup Guide

## Struktur Project

```
billiard-matchmaking/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Entry point Elysia server
│   │   ├── routes/
│   │   │   ├── auth.ts       # POST /api/auth/signup, /login
│   │   │   ├── match.ts      # POST /api/match/fight, /ready, GET /status
│   │   │   ├── staff.ts      # Staff endpoints
│   │   │   └── leaderboard.ts
│   │   ├── middleware/
│   │   │   └── auth.ts       # JWT middleware
│   │   ├── lib/
│   │   │   ├── db.ts         # PostgreSQL connection pool
│   │   │   └── points.ts     # Sistem poin & penalti HC
│   │   └── jobs/
│   │       └── scheduler.ts  # Cron: daily reset, timeout sweeper
│   ├── db/
│   │   ├── migrations/001_init.sql
│   │   └── migrate.ts
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── player/index.html     # Portal pemain
    └── staff/staff.html      # Panel staff
```

## 📋 API Endpoints

### Auth
| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/api/auth/signup` | Daftar akun pemain |
| POST | `/api/auth/login` | Login player/staff → JWT |

### Match (Player, perlu token)
| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/api/match/fight` | Masuk antrian / join match |
| POST | `/api/match/ready` | Klik ready |
| GET | `/api/match/status` | Cek status session |
| POST | `/api/match/cancel` | Batalkan antrian |
| GET | `/api/match/me` | Data player sendiri |

### Staff (Staff token)
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/staff/players` | Daftar semua pemain |
| PUT | `/api/staff/player/:id/handicap` | Set HC |
| PUT | `/api/staff/player/:id/reset-limit` | Reset jatah match |
| PUT | `/api/staff/player/:id/reset-password` | Reset password |
| POST | `/api/staff/match/result` | Input hasil match |
| GET | `/api/staff/match/history` | Riwayat match |
| PUT | `/api/staff/event/reset` | Reset event (semua poin) |

### Public
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/leaderboard` | Top 50 leaderboard |

---

## 🎯 Sistem Poin

### Matrix HC (Poin Menang)

| Winner ↓ / Lawan → | 3B | 3A | 3+ | 4B | 4A | 4+ |
|---|---|---|---|---|---|---|
| **3B** | 20 | 23 | 26 | 29 | 32 | 35 |
| **3A** | 17 | 20 | 23 | 26 | 29 | 32 |
| **3+** | 14 | 17 | 20 | 23 | 26 | 29 |
| **4B** | 11 | 14 | 17 | 20 | 23 | 26 |
| **4A** | 8  | 11 | 14 | 17 | 20 | 23 |
| **4+** | 5  | 8  | 11 | 14 | 17 | 20 |

### Penalti Ketemu Berulang
| Menang Berturut vs Lawan Sama | Pengurangan |
|---|---|
| 1x, 2x | 0 |
| 3x | -2 |
| 4x | -4 |
| 5x+ | -6 |

> Penalti reset jika lawan sempat menang 1x

---

## ⏰ Background Jobs

| Job | Jadwal | Aksi |
|-----|--------|------|
| Daily Reset | 00:00 WIB (17:00 UTC) | Reset `daily_match = 0` semua player |
| Timeout Sweeper | Setiap 5 detik | Batalkan match yang expired, berikan cooldown 1 mnt |

---

## 🔧 Aturan Bisnis

- **Daily limit**: 3 match per hari per pemain (reset 00:00 WIB)
- **Ready timeout**: 40 detik setelah lawan ditemukan
- **Cooldown**: 1 menit jika tidak klik READY tepat waktu
- **HC valid**: 3B, 3A, 3+, 4B, 4A, 4+ (divalidasi di frontend & backend)
- **Staff account**: 1 akun global via `.env` (STAFF_USERNAME, STAFF_PASSWORD)
- **Event reset**: Manual via Staff Panel → reset semua poin
