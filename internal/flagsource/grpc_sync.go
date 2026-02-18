package flagsource

import (
	"context"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	syncv1 "buf.build/gen/go/open-feature/flagd/protocolbuffers/go/flagd/sync/v1"
	syncv1grpc "buf.build/gen/go/open-feature/flagd/grpc/go/flagd/sync/v1/syncv1grpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// GRPCSyncer connects to flagd's FlagSyncService and streams flag updates.
type GRPCSyncer struct {
	addr string

	mu    sync.RWMutex
	flags map[string]Flag
}

// NewGRPCSyncer creates a syncer targeting the given flagd gRPC address.
func NewGRPCSyncer(addr string) *GRPCSyncer {
	return &GRPCSyncer{
		addr:  addr,
		flags: make(map[string]Flag),
	}
}

// Start connects to flagd, blocks until the first flag configuration is received,
// then spawns a background goroutine for ongoing streaming. Returns an error if
// the initial sync fails within the provided context deadline.
func (s *GRPCSyncer) Start(ctx context.Context) error {
	conn, err := grpc.NewClient(s.addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("grpc dial %s: %w", s.addr, err)
	}

	client := syncv1grpc.NewFlagSyncServiceClient(conn)

	// Block until first response arrives.
	stream, err := client.SyncFlags(ctx, &syncv1.SyncFlagsRequest{})
	if err != nil {
		conn.Close()
		return fmt.Errorf("open sync stream: %w", err)
	}

	resp, err := stream.Recv()
	if err != nil {
		conn.Close()
		return fmt.Errorf("initial sync recv: %w", err)
	}
	if err := s.applyConfig(resp.FlagConfiguration); err != nil {
		conn.Close()
		return fmt.Errorf("initial sync parse: %w", err)
	}

	// Background goroutine continues streaming.
	go s.streamLoop(conn, client, stream)

	return nil
}

func (s *GRPCSyncer) streamLoop(_ *grpc.ClientConn, client syncv1grpc.FlagSyncServiceClient, stream grpc.ServerStreamingClient[syncv1.SyncFlagsResponse]) {
	attempt := 0
	for {
		for {
			resp, err := stream.Recv()
			if err != nil {
				log.Printf("flagd sync stream error: %v", err)
				break
			}
			attempt = 0
			if err := s.applyConfig(resp.FlagConfiguration); err != nil {
				log.Printf("flagd sync parse error: %v", err)
			}
		}

		// Reconnect with exponential backoff.
		delay := max(time.Duration(math.Min(math.Pow(4, float64(attempt)), 60))*time.Second, time.Second)
		attempt++
		log.Printf("flagd sync: reconnecting in %s", delay)
		time.Sleep(delay)

		var err error
		stream, err = client.SyncFlags(context.Background(), &syncv1.SyncFlagsRequest{})
		if err != nil {
			log.Printf("flagd sync: reopen stream: %v", err)
			continue
		}
	}
}

func (s *GRPCSyncer) applyConfig(jsonConfig string) error {
	parsed, err := ParseFlagJSON([]byte(jsonConfig), s.addr)
	if err != nil {
		return err
	}

	m := make(map[string]Flag, len(parsed))
	for _, f := range parsed {
		m[f.Key] = f
	}

	s.mu.Lock()
	s.flags = m
	s.mu.Unlock()

	log.Printf("flagd sync: received %d flags", len(m))
	return nil
}

// Flags returns all synced flags.
func (s *GRPCSyncer) Flags() []Flag {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Flag, 0, len(s.flags))
	for _, f := range s.flags {
		out = append(out, f)
	}
	return out
}

// Flag returns a single flag by key, or false if not found.
func (s *GRPCSyncer) Flag(key string) (Flag, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, ok := s.flags[key]
	return f, ok
}
