# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build optimized standalone executable with bytecode
RUN bun build src/index.ts --compile --bytecode --minify --outfile ./server

# Production stage
FROM debian:bookworm-slim

# OCI labels for GitHub Container Registry
LABEL org.opencontainers.image.source=https://github.com/sing-box-orbit/sing-box-orbit-node
LABEL org.opencontainers.image.description="REST API server for managing sing-box proxy instances"
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

# Install dependencies for sing-box download
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy and run sing-box download script
ARG SINGBOX_VERSION=1.12.17
COPY scripts/download-singbox.sh /tmp/download-singbox.sh
RUN chmod +x /tmp/download-singbox.sh \
    && SINGBOX_VERSION=${SINGBOX_VERSION} SINGBOX_INSTALL_DIR=/usr/local/bin /tmp/download-singbox.sh \
    && rm /tmp/download-singbox.sh

# Create sing-box config directory
RUN mkdir -p /etc/sing-box

# Copy standalone executable
COPY --from=builder /app/server ./server

# Environment variables
ENV NODE_ENV=production
ENV PORT=3333
ENV SINGBOX_BIN=/usr/local/bin/sing-box
ENV SINGBOX_CONFIG_PATH=/etc/sing-box/config.json
ENV SINGBOX_WORKING_DIR=/etc/sing-box
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3333/health || exit 1

# Run standalone executable
CMD ["./server"]
