FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/db-query /app/plugins/official/provider/db-query
WORKDIR /app/plugins/official/provider/db-query
RUN npm install --omit=dev
ENV PORT=9004
EXPOSE 9004
CMD ["npm", "start"]
