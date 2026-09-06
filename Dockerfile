# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o server ./cmd/server

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080
CMD ["./server"]
