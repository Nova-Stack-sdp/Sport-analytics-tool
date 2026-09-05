FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY jest.config.js ./

RUN npm ci --ignore-scripts --no-audit --no-fund --prefer-offline \
	--fetch-retries=2 --fetch-timeout=120000

RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" ./node_modules/.bin/prisma generate

COPY src ./src
COPY tests ./tests

EXPOSE 8080

CMD ["npm", "start"]