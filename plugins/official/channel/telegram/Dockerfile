FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/channel/telegram /app/plugins/official/channel/telegram
WORKDIR /app/plugins/official/channel/telegram
RUN npm install --omit=dev
ENV PORT=9002
EXPOSE 9002
CMD ["npm","start"]
