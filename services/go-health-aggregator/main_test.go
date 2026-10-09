package main

import (
	"encoding/binary"
	"io"
	"net"
	"testing"
)

func TestCheckPostgresSendsStartupMessageAndAcceptsAuthenticationResponse(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan error, 1)
	go func() {
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			done <- acceptErr
			return
		}
		defer conn.Close()
		var size [4]byte
		if _, err := io.ReadFull(conn, size[:]); err != nil {
			done <- err
			return
		}
		length := binary.BigEndian.Uint32(size[:])
		if length < 9 || length > 4096 {
			done <- io.ErrUnexpectedEOF
			return
		}
		payload := make([]byte, length-4)
		if _, err := io.ReadFull(conn, payload); err != nil {
			done <- err
			return
		}
		if binary.BigEndian.Uint32(payload[:4]) != 196608 {
			done <- io.ErrUnexpectedEOF
			return
		}
		if _, err := conn.Write([]byte{'R', 0, 0, 0, 8, 0, 0, 0, 0}); err != nil {
			done <- err
			return
		}
		done <- nil
	}()
	status := checkPostgres("postgres", listener.Addr().String(), "fixture", "fixture")
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if !status.Healthy {
		t.Fatalf("expected protocol response to pass: %+v", status)
	}
}

func TestCheckPostgresRejectsNonPostgresHTTPListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	go func() {
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			return
		}
		defer conn.Close()
		_, _ = conn.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"))
	}()
	status := checkPostgres("postgres", listener.Addr().String(), "fixture", "fixture")
	if status.Healthy {
		t.Fatalf("HTTP endpoint was incorrectly classified as PostgreSQL: %+v", status)
	}
}
