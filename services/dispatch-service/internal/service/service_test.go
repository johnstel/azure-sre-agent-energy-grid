package service

import (
    "context"
    "testing"

    "github.com/streadway/amqp"
)

type stubPersistence struct{}

func (s stubPersistence) Save(_ context.Context, event MeterEvent) error { return nil }

func TestHandleMessageSuccess(t *testing.T) {
    srv := NewServer(stubPersistence{}, "meter-events")
    msg := amqp.Delivery{Body: []byte(`{"id":"1","meterId":"SM-9","reading":37,"correlationId":"corr-1"}`)}
    if err := srv.handleMessage(context.Background(), msg); err != nil {
        t.Fatalf("expected success, got %v", err)
    }
}
