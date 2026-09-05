FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install -g npm@latest  
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "start"]