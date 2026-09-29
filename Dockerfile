FROM oven/bun:1.3 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .
RUN bun ci --ignore-scripts

ARG NETWORK=mainnet

RUN bun run $NETWORK
RUN bun run build:regular

FROM nginx:alpine AS final

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
