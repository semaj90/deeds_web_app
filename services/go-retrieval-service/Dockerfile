FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /go-retrieval-service .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /go-retrieval-service /usr/local/bin/go-retrieval-service

EXPOSE 8100 50053

ENTRYPOINT ["go-retrieval-service"]
