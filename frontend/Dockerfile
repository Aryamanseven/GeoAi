FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json ./package.json
COPY frontend/postcss.config.js ./postcss.config.js
COPY frontend/tailwind.config.js ./tailwind.config.js
COPY frontend/vite.config.js ./vite.config.js
COPY frontend/index.html ./index.html
COPY frontend/src ./src
COPY frontend/public ./public

RUN npm install
RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
