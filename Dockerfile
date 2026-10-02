FROM node:22-alpine

# ffmpeg: tempo/energy analysis; chromaprint (fpcalc): audio fingerprints for auto-tagging
RUN apk add --no-cache ffmpeg chromaprint

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY assets ./assets
COPY scripts ./scripts

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
