FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/channel/slack /app/plugins/official/channel/slack
WORKDIR /app/plugins/official/channel/slack
RUN npm install --omit=dev
ENV PORT=9000
EXPOSE 9000
CMD ["npm","start"]
