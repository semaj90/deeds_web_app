FROM golang:1.24-alpine@sha256:8bee1901f1e530bfb4a7850aa7a479d17ae3a18beb6e09064ed54cfd245b7191 AS builder

RUN apk add --no-cache coreutils findutils git protobuf

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN BUILD_REVISION="$(find . -type f \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' -o -name 'Dockerfile' \) -print | LC_ALL=C sort | xargs sha256sum | sha256sum | awk '{print $1}')" && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.compiledServiceBuildRevisionV1=sha256:${BUILD_REVISION}" -o /go-embedding-service .

FROM alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /go-embedding-service /usr/local/bin/go-embedding-service

EXPOSE 50051 8097

ENTRYPOINT ["go-embedding-service"]
