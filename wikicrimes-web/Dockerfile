FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install leaflet@1.9.4

FROM nginx:alpine
COPY --from=builder /app/node_modules/leaflet/dist/leaflet.js /usr/share/nginx/html/leaflet.js
COPY --from=builder /app/node_modules/leaflet/dist/leaflet.css /usr/share/nginx/html/leaflet.css
COPY --from=builder /app/node_modules/leaflet/dist/images /usr/share/nginx/html/images
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80