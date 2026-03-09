FROM node:22-alpine
WORKDIR /app
COPY examples/node/email/package.json /app/package.json
RUN npm install --omit=dev
COPY examples/node/email/src /app/src
COPY examples/node/email/shared /app/shared
ENV PORT=9001
EXPOSE 9001
CMD ["npm","start"]
