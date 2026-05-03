import { bearer } from "@elysiajs/bearer";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";

export type JWTPayload = {
  accountId: number;
  playerId: number;
  username: string;
  role: "player" | "staff";
};

// JWT plugin
export const jwtPlugin = new Elysia({ name: "jwt" }).use(
  jwt({
    name: "jwt",
    secret: process.env.JWT_SECRET,
    exp: "7d",
  })
);

export const authMiddleware = new Elysia({ name: "auth" })
  .use(jwtPlugin)
  .use(bearer())