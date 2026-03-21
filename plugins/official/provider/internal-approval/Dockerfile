FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/internal-approval /app/plugins/official/provider/internal-approval
WORKDIR /app/plugins/official/provider/internal-approval
RUN npm install --omit=dev
CMD ["npx","tsx","src/runner-entrypoint.ts"]
