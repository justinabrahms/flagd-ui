# Stage 1: Build frontend and Go binary
FROM node:20-bookworm AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/frontend/dist /src/web/dist
RUN CGO_ENABLED=0 go build -o /flagd-ui ./cmd/flagd-ui

# Stage 2: Minimal runtime
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /flagd-ui /flagd-ui
USER nonroot:nonroot
EXPOSE 9090
ENTRYPOINT ["/flagd-ui"]
