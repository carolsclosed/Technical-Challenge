FROM node:24-alpine

RUN apk add --no-cache ca-certificates docker-cli socat

WORKDIR /workspace
