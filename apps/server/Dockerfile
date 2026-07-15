# Build từ root repo: docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages ./packages
COPY shared-libs ./shared-libs
RUN pnpm install --frozen-lockfile
# Generate Prisma client trước — nest build cần types của model
RUN cd apps/server && pnpm exec prisma generate
RUN pnpm build --filter @card-games/server
# Đóng gói riêng server + prod deps (workspace deps được pack kèm)
RUN pnpm --filter @card-games/server --prod deploy --legacy /out
# Generate Prisma client cho bản deploy (dùng CLI đã cài trong workspace)
RUN cd /out && /repo/apps/server/node_modules/.bin/prisma generate

FROM node:22-alpine
RUN apk add --no-cache openssl
# prisma CLI global (khớp version @prisma/client) → container chạy được
# `prisma migrate deploy` khi release mà không cần tải gì thêm
RUN npm i -g prisma@6.19.3
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
EXPOSE 3000
CMD ["node", "dist/main.js"]
