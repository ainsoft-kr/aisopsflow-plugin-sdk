FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/weather-openmeteo /app/plugins/official/provider/weather-openmeteo
WORKDIR /app/plugins/official/provider/weather-openmeteo
RUN npm install --omit=dev
CMD ["npx","tsx","src/runner-entrypoint.ts"]
