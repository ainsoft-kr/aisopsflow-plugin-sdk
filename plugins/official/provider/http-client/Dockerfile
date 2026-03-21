FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/http-client /app/plugins/official/provider/http-client
WORKDIR /app/plugins/official/provider/http-client
RUN npm install --omit=dev
CMD ["npx","tsx","src/runner-entrypoint.ts"]
