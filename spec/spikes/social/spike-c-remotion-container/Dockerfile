# Remotion render container for ReducedRecipes social videos.
# Base: Node 22 slim with Chromium deps Remotion needs.

FROM node:22-bookworm-slim

# Chromium runtime deps (Remotion's bundled Chromium needs these shared libs).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY remotion-app/package.json ./
RUN corepack enable && npm install --no-audit --no-fund --loglevel=error

COPY remotion-app/ ./
RUN mkdir -p out

# Default command: render with default props.
CMD ["npm", "run", "render"]
