FROM node:22-alpine
WORKDIR /app
COPY examples/node/db-query-mock/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/db-query-mock/src /app/src
COPY examples/node/db-query-mock/shared /app/shared
COPY examples/node/db-query-mock/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9004
EXPOSE 9004
CMD ["npm", "start"]
