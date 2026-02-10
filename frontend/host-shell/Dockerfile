# Multi-stage Dockerfile for Frontend MFE

# Stage 1: Base image
FROM node:18-alpine AS base
LABEL maintainer="commerce-team@example.com"

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Stage 2: Development image
FROM base AS development

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose development port
EXPOSE 3000

# Start development server
CMD ["npm", "start"]

# Stage 3: Build stage
FROM base AS builder

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Stage 4: Production image with nginx
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/*

# Copy built application from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health.html || exit 1

# Create health check file
RUN echo "OK" > /usr/share/nginx/html/health.html

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Build arguments for metadata
ARG VERSION=unknown
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

# Labels for image metadata
LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="Commerce Host Shell MFE" \
      org.opencontainers.image.description="E-commerce platform host shell micro-frontend" \
      org.opencontainers.image.vendor="Commerce Platform"
