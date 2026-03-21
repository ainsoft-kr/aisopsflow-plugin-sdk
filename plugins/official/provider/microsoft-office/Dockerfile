FROM node:20-alpine
WORKDIR /app

COPY packages/js /app/packages/js
COPY plugins/official/provider/microsoft-office /app/plugins/official/provider/microsoft-office
WORKDIR /app/plugins/official/provider/microsoft-office
RUN npm install --omit=dev

CMD ["npx", "tsx", "src/runner-entrypoint.ts"]
