package main

import (
	"errors"
	"net"
	"testing"
)

func TestResolveQdrantGrpcHostPreservesNumericHost(t *testing.T) {
	called := false
	got := resolveQdrantGrpcHostWithLookup("127.0.0.1", func(string) ([]net.IP, error) {
		called = true
		return nil, nil
	})
	if got != "127.0.0.1" {
		t.Fatalf("got %q, want numeric host unchanged", got)
	}
	if called {
		t.Fatal("numeric host should not trigger DNS lookup")
	}
}

func TestResolveQdrantGrpcHostPrefersIPv4(t *testing.T) {
	got := resolveQdrantGrpcHostWithLookup("qdrant", func(host string) ([]net.IP, error) {
		if host != "qdrant" {
			t.Fatalf("lookup host = %q, want qdrant", host)
		}
		return []net.IP{net.ParseIP("2001:db8::1"), net.ParseIP("192.0.2.10")}, nil
	})
	if got != "192.0.2.10" {
		t.Fatalf("got %q, want IPv4 address", got)
	}
}

func TestResolveQdrantGrpcHostFallsBackOnLookupFailure(t *testing.T) {
	got := resolveQdrantGrpcHostWithLookup("qdrant", func(string) ([]net.IP, error) {
		return nil, errors.New("dns unavailable")
	})
	if got != "qdrant" {
		t.Fatalf("got %q, want configured hostname on lookup failure", got)
	}
}
