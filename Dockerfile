# syntax=docker/dockerfile:1.7
# The public demo: examples/server.mjs serving the built demo app and the
# collaboration relay from one process. Built and deployed by deploy/.

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:examples

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ENV NODE_ENV=production \
    PORT=8080 \
    TRUST_PROXY=1 \
    OPENSHEETS_DATA_DIR=/data
WORKDIR /app
# Only what the server needs at runtime: ws, and redis when REDIS_URL is set
COPY deploy/container/package.json deploy/container/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY server ./server
COPY examples/server.mjs ./examples/server.mjs
COPY --from=build /app/examples/dist ./examples/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "examples/server.mjs"]

LABEL org.opencontainers.image.source="https://github.com/w0h1v/OpenSheets" \
      org.opencontainers.image.description="OpenSheets demo: the built demo app and its collaboration relay"
