FROM oven/bun:canary-alpine

RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
