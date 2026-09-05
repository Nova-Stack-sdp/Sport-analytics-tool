
FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --no-fund

COPY . .

CMD ["npm", "start"]