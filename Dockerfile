# Next.js(web-client)와 OR-Tools 엔진(algorithm-engine)을 한 이미지에 담는다.
# /api/schedule이 같은 호스트에서 solver.py를 실행하기 때문이다.
# 빌드: docker build --build-arg GIT_REVISION=$(git rev-parse --short HEAD) -t shift-scheduler:$(git rev-parse --short HEAD) .
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# 웹 빌드. DB(DATABASE_URL)는 실행 때만 필요하다
FROM base AS web
WORKDIR /app/web-client
COPY web-client/package.json web-client/package-lock.json ./
RUN npm ci
COPY web-client/ ./
COPY algorithm-engine/sample_input.json /app/algorithm-engine/
# public/은 비어 있으면 git에 없으므로 런타임 COPY가 깨지지 않게 만들어 둔다
RUN mkdir -p public && npm run build && npm prune --omit=dev

# 엔진 venv. 런타임과 같은 베이스라서 /usr/bin/python3 경로가 그대로 맞는다
FROM base AS engine
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/*
COPY algorithm-engine/requirements.txt /tmp/
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

FROM base
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY --from=engine /opt/venv /opt/venv
WORKDIR /app/web-client
COPY --chown=node:node algorithm-engine/solver.py algorithm-engine/sample_input.json /app/algorithm-engine/
COPY --from=web --chown=node:node /app/web-client/package.json ./
COPY --from=web --chown=node:node /app/web-client/node_modules ./node_modules
COPY --from=web --chown=node:node /app/web-client/public ./public
COPY --from=web --chown=node:node /app/web-client/.next ./.next
ENV NODE_ENV=production \
    ENGINE_DIR=/app/algorithm-engine \
    ENGINE_PYTHON=/opt/venv/bin/python
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
