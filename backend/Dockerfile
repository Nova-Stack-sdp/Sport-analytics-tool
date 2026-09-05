FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install -g npm@latest
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./

RUN npx prisma generate

COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]