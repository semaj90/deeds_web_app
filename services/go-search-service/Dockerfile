FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /go-search-service .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /go-search-service /usr/local/bin/go-search-service

EXPOSE 8096 50055

ENTRYPOINT ["go-search-service"]