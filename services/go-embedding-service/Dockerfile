FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git protobuf

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /go-embedding-service .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /go-embedding-service /usr/local/bin/go-embedding-service

EXPOSE 50051 8097

ENTRYPOINT ["go-embedding-service"]