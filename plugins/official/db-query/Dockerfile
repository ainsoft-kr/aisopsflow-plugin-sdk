FROM node:22-alpine
WORKDIR /app
COPY plugins/official/db-query/package.json /app/package.json
RUN npm install --omit=dev
COPY plugins/official/db-query/src /app/src
COPY plugins/official/db-query/shared /app/shared
COPY plugins/official/db-query/runner-plugin.yaml /app/runner-plugin.yaml
COPY plugins/official/db-query/plugin.manifest.yaml /app/plugin.manifest.yaml
ENV PORT=9004
EXPOSE 9004
CMD ["npm", "start"]
