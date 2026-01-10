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

WORKDIR /app

# Install sing-box
ARG SINGBOX_VERSION=1.10.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && ARCH=$(dpkg --print-architecture) \
    && case "$ARCH" in \
        amd64) SINGBOX_ARCH="amd64" ;; \
        arm64) SINGBOX_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac \
    && curl -Lo /tmp/sing-box.tar.gz "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${SINGBOX_ARCH}.tar.gz" \
    && tar -xzf /tmp/sing-box.tar.gz -C /tmp \
    && mv /tmp/sing-box-${SINGBOX_VERSION}-linux-${SINGBOX_ARCH}/sing-box /usr/local/bin/sing-box \
    && chmod +x /usr/local/bin/sing-box \
    && rm -rf /tmp/* \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create sing-box config directory
RUN mkdir -p /etc/sing-box

# Copy standalone executable
COPY --from=builder /app/server ./server

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SINGBOX_BIN=/usr/local/bin/sing-box
ENV SINGBOX_CONFIG_PATH=/etc/sing-box/config.json
ENV SINGBOX_WORKING_DIR=/etc/sing-box
ENV CLASH_API_URL=http://127.0.0.1:9090
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run standalone executable
CMD ["./server"]
