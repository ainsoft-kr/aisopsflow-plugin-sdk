FROM node:22-alpine
WORKDIR /app
COPY packages/js /app/packages/js
COPY plugins/official/provider/gmail /app/plugins/official/provider/gmail
WORKDIR /app/plugins/official/provider/gmail
RUN npm install --omit=dev
ENV PORT=9005
EXPOSE 9005
CMD ["npm", "start"]
