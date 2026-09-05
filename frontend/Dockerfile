FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "start"]