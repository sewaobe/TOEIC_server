FROM node:22 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG FIREBASE_SERVICE_ACCOUNT
ENV FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}

RUN npm run build

FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm install --omit=dev

ENV FIREBASE_SERVICE_ACCOUNT=${FIREBASE_SERVICE_ACCOUNT}

CMD ["node", "dist/server.js"]

EXPOSE 3000
