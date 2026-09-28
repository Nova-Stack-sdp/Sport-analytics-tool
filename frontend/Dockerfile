FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm config set fetch-retries 10 fetch-retry-mintimeout 10000 fetch-retry-maxtimeout 60000 fetch-timeout 120000 \
  && npm ci --ignore-scripts --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
