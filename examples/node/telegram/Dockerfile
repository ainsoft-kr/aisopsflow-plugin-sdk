FROM node:22-alpine
WORKDIR /app
COPY examples/node/telegram/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/telegram/src /app/src
COPY examples/node/telegram/shared /app/shared
ENV PORT=9002
EXPOSE 9002
CMD ["npm","start"]
