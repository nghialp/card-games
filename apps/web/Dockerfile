# Build từ root repo: docker build -f apps/web/Dockerfile .
# Không đặt VITE_SERVER_URL → client dùng same-origin, nginx proxy /socket.io
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
COPY shared-libs ./shared-libs
RUN pnpm install --frozen-lockfile
RUN pnpm build --filter @card-games/web

FROM nginx:1.27-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
