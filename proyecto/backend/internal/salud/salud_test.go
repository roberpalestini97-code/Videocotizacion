package salud

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestListo(t *testing.T) {
	ok := Comprobacion{"base", func(context.Context) error { return nil }}
	mal := Comprobacion{"stt", func(context.Context) error { return errors.New("caído") }}
	lento := Comprobacion{"llm", func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }}
	if err := Listo(context.Background(), time.Second, ok); err != nil {
		t.Fatal(err)
	}
	err := Listo(context.Background(), 10*time.Millisecond, ok, mal, lento)
	if err == nil || !strings.Contains(err.Error(), "stt") || !strings.Contains(err.Error(), "llm") || strings.Contains(err.Error(), "base") {
		t.Fatalf("err = %v", err)
	}
}
