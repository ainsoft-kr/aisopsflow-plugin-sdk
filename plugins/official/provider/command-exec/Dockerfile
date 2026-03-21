FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/command-exec /app/plugins/official/provider/command-exec
WORKDIR /app/plugins/official/provider/command-exec
RUN npm install --omit=dev
CMD ["npx","tsx","src/runner-entrypoint.ts"]
