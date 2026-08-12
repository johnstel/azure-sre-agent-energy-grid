package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/streadway/amqp"
)

type stubPersistence struct {
	saveErr      error
	lookupResult *TransactionRecord
	lookupErr    error
	savedEvents  []MeterEvent
}

func (s *stubPersistence) Save(_ context.Context, event MeterEvent) error {
	s.savedEvents = append(s.savedEvents, event)
	return s.saveErr
}

func (s *stubPersistence) Lookup(_ context.Context, correlationID string) (*TransactionRecord, error) {
	if s.lookupErr != nil {
		return nil, s.lookupErr
	}
	if s.lookupResult == nil {
		return nil, ErrNotFound
	}
	return s.lookupResult, nil
}

func TestHandleMessageSuccess(t *testing.T) {
	persistence := &stubPersistence{}
	srv := NewServer(persistence, "meter-events")
	msg := amqp.Delivery{Body: []byte(`{"id":"1","meterId":"SM-9","reading":37,"correlationId":"corr-1"}`)}
	if err := srv.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(persistence.savedEvents) != 1 {
		t.Fatalf("expected one saved event, got %d", len(persistence.savedEvents))
	}
}

func TestResolveRabbitURLBuildsEscapedCredentialURL(t *testing.T) {
	t.Setenv("RABBITMQ_URL", "")
	t.Setenv("RABBITMQ_HOST", "rabbitmq")
	t.Setenv("RABBITMQ_PORT", "5672")
	t.Setenv("RABBITMQ_USERNAME", "energy-grid-mq")
	t.Setenv("RABBITMQ_PASSWORD", "p@ss:word")

	parsed, err := url.Parse(resolveRabbitURL())
	if err != nil {
		t.Fatalf("expected a valid RabbitMQ URL, got %v", err)
	}
	password, hasPassword := parsed.User.Password()
	if parsed.Scheme != "amqp" || parsed.Host != "rabbitmq:5672" || parsed.User.Username() != "energy-grid-mq" || !hasPassword || password != "p@ss:word" {
		t.Fatalf("unexpected RabbitMQ URL: %s", parsed.String())
	}
}

func TestHandleMessageTreatsExpiredSyntheticAsSafe(t *testing.T) {
	persistence := &stubPersistence{saveErr: ErrExpired}
	srv := NewServer(persistence, "meter-events")
	msg := amqp.Delivery{Body: []byte(`{"id":"2","meterId":"SM-SYNTHETIC-0001","reading":0.01,"correlationId":"corr-2","synthetic":true,"expiresAt":"2020-01-01T00:00:00Z"}`)}
	if err := srv.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("expected expired synthetic event to be ignored, got %v", err)
	}
}

func TestHandleMessageSurfacesPersistenceFailure(t *testing.T) {
	persistence := &stubPersistence{saveErr: errors.New("mongodb unavailable")}
	srv := NewServer(persistence, "meter-events")
	msg := amqp.Delivery{Body: []byte(`{"id":"3","meterId":"SM-SYNTHETIC-0001","reading":0.01,"correlationId":"corr-persistence","synthetic":true,"syntheticName":"slo-meter-ingest","syntheticMode":"demo","expiresAt":"2099-01-01T00:00:00Z"}`)}
	if err := srv.handleMessage(context.Background(), msg); err == nil {
		t.Fatal("expected a persistence failure to be returned for retry handling")
	}
}

func TestMeterEventDocumentPreservesRegularReadingsWithoutExpiry(t *testing.T) {
	event := MeterEvent{
		ID:            "event-regular",
		MeterID:       "SM-9",
		Reading:       37,
		Zone:          "Zone-A North",
		ObservedAt:    "2026-01-01T00:00:00Z",
		CorrelationID: "corr-regular",
	}
	document := meterEventDocument(event, time.Date(2026, 1, 1, 0, 0, 1, 0, time.UTC))
	if document["meterId"] != "SM-9" || document["reading"] != float64(37) {
		t.Fatalf("expected the original meter fields to be retained, got %#v", document)
	}
	if _, found := document["expiresAt"]; found {
		t.Fatalf("regular meter events must not receive TTL cleanup metadata: %#v", document)
	}
}

func TestMeterEventDocumentAddsExpiryOnlyForSyntheticTransactions(t *testing.T) {
	event := MeterEvent{
		ID:            "event-synthetic",
		MeterID:       "SM-SYNTHETIC-0001",
		Reading:       0.01,
		CorrelationID: "corr-synthetic",
		Synthetic:     true,
		SyntheticName: "slo-meter-ingest",
		SyntheticMode: "demo",
		ExpiresAt:     time.Date(2026, 1, 1, 0, 5, 0, 0, time.UTC),
	}
	document := meterEventDocument(event, time.Date(2026, 1, 1, 0, 0, 1, 0, time.UTC))
	if document["expiresAt"] != event.ExpiresAt {
		t.Fatalf("expected synthetic transaction expiry metadata, got %#v", document)
	}
}

func TestIsIdempotentDuplicateRequiresMatchingEventIdentity(t *testing.T) {
	event := MeterEvent{ID: "event-1", CorrelationID: "corr-1", Synthetic: true, SyntheticName: "slo-meter-ingest", SyntheticMode: "demo"}
	matching := &TransactionRecord{ID: "event-1", CorrelationID: "corr-1", Synthetic: true, SyntheticName: "slo-meter-ingest", SyntheticMode: "demo"}
	if !isIdempotentDuplicate(event, matching) {
		t.Fatal("expected the same synthetic event to be idempotent")
	}
	conflicting := &TransactionRecord{ID: "different-event", CorrelationID: "corr-1", Synthetic: true, SyntheticName: "slo-meter-ingest", SyntheticMode: "demo"}
	if isIdempotentDuplicate(event, conflicting) {
		t.Fatal("expected a different event ID with the same correlation ID to be a conflict")
	}
}

func TestTransactionsHandlerReturnsSafeMetadata(t *testing.T) {
	persistence := &stubPersistence{lookupResult: &TransactionRecord{CorrelationID: "corr-3", Status: "completed", PersistedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Synthetic: true}}
	srv := NewServer(persistence, "meter-events")
	req := httptest.NewRequest(http.MethodGet, "/transactions/corr-3", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "\"status\":\"completed\"") {
		t.Fatalf("expected completed metadata in body, got %s", rec.Body.String())
	}
}

func TestTransactionsHandlerReturnsNotFoundWhenMissing(t *testing.T) {
	persistence := &stubPersistence{lookupErr: ErrNotFound}
	srv := NewServer(persistence, "meter-events")
	req := httptest.NewRequest(http.MethodGet, "/transactions/corr-missing", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestTransactionsHandlerRejectsMalformedCorrelationIDs(t *testing.T) {
	persistence := &stubPersistence{}
	srv := NewServer(persistence, "meter-events")
	req := httptest.NewRequest(http.MethodGet, "/transactions/bad/id", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
