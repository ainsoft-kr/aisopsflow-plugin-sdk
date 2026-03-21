FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/google-news /app/plugins/official/provider/google-news
WORKDIR /app/plugins/official/provider/google-news
RUN npm install --omit=dev
CMD ["npx","tsx","src/runner-entrypoint.ts"]
