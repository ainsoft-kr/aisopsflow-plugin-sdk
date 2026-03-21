FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/microsoft-office-graph /app/plugins/official/provider/microsoft-office-graph
WORKDIR /app/plugins/official/provider/microsoft-office-graph
RUN npm install --omit=dev
CMD ["npx", "tsx", "src/runner-entrypoint.ts"]
