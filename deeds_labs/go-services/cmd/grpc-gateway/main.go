//go:build ignore

// Placeholder high-performance gRPC server scaffold (enable by removing build tag).
package main

import (
	"context"
	"log"
	"net"
	"time"

	grpc "google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
)

func main() {
  lis, err := net.Listen("tcp", ":7070")
  if err != nil { log.Fatalf("listen: %v", err) }
  srv := grpc.NewServer(
    grpc.KeepaliveParams(keepalive.ServerParameters{MaxConnectionIdle: 5 * time.Minute, Time: 2 * time.Minute, Timeout: 20 * time.Second}),
    grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{MinTime: 30 * time.Second, PermitWithoutStream: true}),
  )
  // TODO: register generated services (TaskQueue, etc.)
  log.Println("grpc.server.listening", ":7070")
  if err := srv.Serve(lis); err != nil { log.Fatal(err) }
  _ = context.Background()
}
