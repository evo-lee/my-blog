FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/blog.db \
    UPLOAD_DIR=/data/uploads/img

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json package-lock.json drizzle.config.ts tsconfig.json ./
COPY db ./db

VOLUME ["/data"]

EXPOSE 3000
CMD ["node", "dist/boot.js"]
