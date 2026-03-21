FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/channel/email /app/plugins/official/channel/email
WORKDIR /app/plugins/official/channel/email
RUN npm install --omit=dev
ENV PORT=9001
EXPOSE 9001
CMD ["npm","start"]
