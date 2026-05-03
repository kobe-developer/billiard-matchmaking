FROM oven/bun:canary-alpine AS build-stage

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:alpine3.18-slim

COPY --from=build-stage /app/dist/ /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/script.js

EXPOSE 80