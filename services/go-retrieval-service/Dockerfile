FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /go-retrieval-service .

FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /go-retrieval-service /usr/local/bin/go-retrieval-service

EXPOSE 8100 50053

ENTRYPOINT ["go-retrieval-service"]
