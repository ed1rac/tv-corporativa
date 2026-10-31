# ==========================================
# Build Stage (Golang 1.22 + SQLite CGO)
# ==========================================
FROM golang:1.22-alpine AS builder

WORKDIR /app

# SQLite driver (mattn/go-sqlite3) requires gcc/musl-dev
RUN apk add --no-cache gcc g++ musl-dev make

COPY go.mod ./
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# Resolve dependencies and generate go.sum automatically
RUN go mod tidy && go mod download

# Compile static binary
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o tv-corporativa ./cmd/server

# ==========================================
# Runner Stage (Ultra-minimal Alpine)
# ==========================================
FROM alpine:3.19 AS runner

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

ENV PORT=8080
ENV DB_PATH=/app/data/tv_corporativa.db
ENV MEDIA_PATH=/app/media

RUN mkdir -p /app/data /app/media

COPY --from=builder /app/tv-corporativa ./
COPY public/ ./public/
COPY media/ ./media/

EXPOSE 8080

VOLUME ["/app/data", "/app/media"]

CMD ["./tv-corporativa"]
