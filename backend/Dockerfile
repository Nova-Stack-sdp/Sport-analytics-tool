FROM node:24-alpine

WORKDIR /app

RUN for i in 1 2 3; do apk add --no-cache openssl && break || sleep 5; done

COPY package*.json ./
RUN npm config set fetch-retries 5 fetch-retry-mintimeout 5000 \
  && npm ci --ignore-scripts --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./

RUN npx prisma generate

COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]