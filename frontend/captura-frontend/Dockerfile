# Frontend Dockerfile (Vite build + Nginx serve)

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/captura-frontend/package*.json ./
RUN npm ci
COPY frontend/captura-frontend/ ./
# Permite inyectar VITE_API_BASE en build de producción
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:alpine AS run
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/captura-frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

