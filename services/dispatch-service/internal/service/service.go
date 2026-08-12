package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/streadway/amqp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

var correlationIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

var (
	ErrInvalidCorrelationID = errors.New("invalid correlation id")
	ErrNotFound             = errors.New("transaction not found")
	ErrExpired              = errors.New("synthetic transaction expired")
	ErrCorrelationConflict  = errors.New("correlation id conflicts with an existing transaction")
)

type MeterEvent struct {
	ID            string    `json:"id"`
	MeterID       string    `json:"meterId"`
	Reading       float64   `json:"reading"`
	Zone          string    `json:"zone"`
	ObservedAt    string    `json:"observedAt"`
	CorrelationID string    `json:"correlationId"`
	Synthetic     bool      `json:"synthetic,omitempty"`
	SyntheticName string    `json:"syntheticName,omitempty"`
	SyntheticMode string    `json:"syntheticMode,omitempty"`
	ExpiresAt     time.Time `json:"expiresAt,omitempty"`
}

type TransactionRecord struct {
	ID            string    `bson:"id" json:"-"`
	CorrelationID string    `bson:"correlationId" json:"correlationId"`
	Status        string    `bson:"status" json:"status"`
	PersistedAt   time.Time `bson:"persistedAt" json:"persistedAt"`
	ExpiresAt     time.Time `bson:"expiresAt,omitempty" json:"expiresAt,omitempty"`
	Synthetic     bool      `bson:"synthetic,omitempty" json:"synthetic,omitempty"`
	SyntheticName string    `bson:"syntheticName,omitempty" json:"syntheticName,omitempty"`
	SyntheticMode string    `bson:"syntheticMode,omitempty" json:"syntheticMode,omitempty"`
}

type validatedCorrelationID string

type Persistence interface {
	Save(context.Context, MeterEvent) error
	Lookup(context.Context, string) (*TransactionRecord, error)
}

type MongoPersistence struct {
	client     *mongo.Client
	dbName     string
	collection string
}

func NewMongoPersistence(uri, dbName, collection string) (*MongoPersistence, error) {
	if uri == "" {
		return nil, fmt.Errorf("mongo uri missing")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	persistence := &MongoPersistence{client: client, dbName: dbName, collection: collection}
	if err := persistence.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return persistence, nil
}

func (p *MongoPersistence) ensureIndexes(ctx context.Context) error {
	if p.client == nil {
		return fmt.Errorf("mongo client not initialized")
	}
	collection := p.client.Database(p.dbName).Collection(p.collection)
	_, err := collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "correlationId", Value: 1}},
			// Only the probe owns idempotency. Customer events retain their
			// existing persistence behavior and cannot block index creation.
			Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"synthetic": true}).SetName("uq_synthetic_correlation_id"),
		},
		{
			Keys:    bson.D{{Key: "expiresAt", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(0).SetName("ttl_expires_at"),
		},
	})
	return err
}

func (p *MongoPersistence) Save(ctx context.Context, event MeterEvent) error {
	if p.client == nil {
		return fmt.Errorf("mongo client not initialized")
	}
	if !isValidCorrelationID(event.CorrelationID) {
		return ErrInvalidCorrelationID
	}
	if event.Synthetic && !event.ExpiresAt.IsZero() && event.ExpiresAt.Before(time.Now().UTC()) {
		return ErrExpired
	}
	collection := p.client.Database(p.dbName).Collection(p.collection)
	_, err := collection.InsertOne(ctx, meterEventDocument(event, time.Now().UTC()))
	if err == nil {
		return nil
	}
	if mongo.IsDuplicateKeyError(err) {
		existing, lookupErr := p.Lookup(ctx, event.CorrelationID)
		if lookupErr != nil {
			return fmt.Errorf("lookup duplicate correlation id: %w", lookupErr)
		}
		if isIdempotentDuplicate(event, existing) {
			return nil
		}
		return fmt.Errorf("%w: %s", ErrCorrelationConflict, event.CorrelationID)
	}
	return err
}

// meterEventDocument retains normal meter readings while attaching the minimal
// completion metadata that the synthetic probe reads back through dispatch.
func meterEventDocument(event MeterEvent, persistedAt time.Time) bson.M {
	document := bson.M{
		"id":            event.ID,
		"meterId":       event.MeterID,
		"reading":       event.Reading,
		"zone":          event.Zone,
		"observedAt":    event.ObservedAt,
		"correlationId": event.CorrelationID,
		"status":        "completed",
		"persistedAt":   persistedAt,
		"synthetic":     event.Synthetic,
	}
	if event.Synthetic {
		document["syntheticName"] = event.SyntheticName
		document["syntheticMode"] = event.SyntheticMode
		if !event.ExpiresAt.IsZero() {
			document["expiresAt"] = event.ExpiresAt
		}
	}
	return document
}

func isIdempotentDuplicate(event MeterEvent, existing *TransactionRecord) bool {
	if existing == nil || existing.ID != event.ID || existing.Synthetic != event.Synthetic {
		return false
	}
	if !event.Synthetic {
		return true
	}
	return existing.SyntheticName == event.SyntheticName && existing.SyntheticMode == event.SyntheticMode
}

func (p *MongoPersistence) Lookup(ctx context.Context, correlationID string) (*TransactionRecord, error) {
	validatedID, err := validateCorrelationID(correlationID)
	if err != nil {
		return nil, err
	}
	if p.client == nil {
		return nil, fmt.Errorf("mongo client not initialized")
	}
	return p.lookupSyntheticTransaction(ctx, validatedID)
}

// lookupSyntheticTransaction keeps the MongoDB query shape fixed: request input
// is accepted only as a regex-validated scalar, never as an operator or key.
// CodeQL alert #5 is a documented MongoDB scalar-filter false positive; do not
// replace this fixed bson.D with a request-decoded query document.
func (p *MongoPersistence) lookupSyntheticTransaction(ctx context.Context, correlationID validatedCorrelationID) (*TransactionRecord, error) {
	collection := p.client.Database(p.dbName).Collection(p.collection)
	var record TransactionRecord
	filter := bson.D{
		{Key: "correlationId", Value: string(correlationID)},
		{Key: "synthetic", Value: true},
	}
	err := collection.FindOne(ctx, filter).Decode(&record)
	if err == mongo.ErrNoDocuments {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &record, nil
}

func validateCorrelationID(correlationID string) (validatedCorrelationID, error) {
	if !isValidCorrelationID(correlationID) {
		return "", ErrInvalidCorrelationID
	}
	return validatedCorrelationID(correlationID), nil
}

func isValidCorrelationID(correlationID string) bool {
	return correlationIDPattern.MatchString(correlationID)
}

type Server struct {
	persistence Persistence
	queueName   string
	tracer      trace.Tracer
	logger      *log.Logger
	amqpConn    *amqp.Connection
	amqpCh      *amqp.Channel
}

func resolveOtlpEndpoint() string {
	if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"); endpoint != "" {
		return endpoint
	}
	if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); endpoint != "" {
		return endpoint
	}
	if connectionString := os.Getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"); connectionString != "" {
		for _, entry := range strings.Split(connectionString, ";") {
			parts := strings.SplitN(entry, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			if strings.EqualFold(key, "IngestionEndpoint") {
				return strings.TrimRight(value, "/") + "/v2/track"
			}
		}
	}
	return ""
}

func InitTracer() *sdktrace.TracerProvider {
	if endpoint := resolveOtlpEndpoint(); endpoint != "" {
		exporter, err := otlptracehttp.New(context.Background(), otlptracehttp.WithEndpointURL(endpoint))
		if err != nil {
			log.Printf("failed to initialize OTLP exporter: %v", err)
		} else {
			provider := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exporter))
			otel.SetTracerProvider(provider)
			return provider
		}
	}

	exporter, err := stdouttrace.New()
	if err != nil {
		log.Fatal(err)
	}
	provider := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	otel.SetTracerProvider(provider)
	return provider
}

func NewServer(persistence Persistence, queueName string) *Server {
	return &Server{persistence: persistence, queueName: queueName, tracer: otel.Tracer("dispatch-service"), logger: log.Default()}
}

func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":   "ok",
		"service":  "dispatch-service",
		"queue":    s.queueName,
		"scenario": os.Getenv("SRE_SCENARIO"),
	})
}

func (s *Server) rootHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"service": "dispatch-service", "queue": s.queueName})
}

func (s *Server) transactionsHandler(w http.ResponseWriter, r *http.Request) {
	correlationID := strings.TrimPrefix(r.URL.Path, "/transactions/")
	if correlationID == "" || strings.Contains(correlationID, "/") || strings.Contains(correlationID, "..") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid correlation id"})
		return
	}
	if !isValidCorrelationID(correlationID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid correlation id"})
		return
	}
	if s.persistence == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "persistence unavailable"})
		return
	}
	record, err := s.persistence.Lookup(r.Context(), correlationID)
	switch {
	case err == nil:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"correlationId": record.CorrelationID,
			"status":        record.Status,
			"persistedAt":   record.PersistedAt.UTC().Format(time.RFC3339Nano),
			"synthetic":     record.Synthetic,
		})
	case errors.Is(err, ErrNotFound):
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "transaction not found"})
	case errors.Is(err, ErrInvalidCorrelationID):
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "invalid correlation id"})
	default:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/health":
		s.healthHandler(w, r)
	case strings.HasPrefix(r.URL.Path, "/transactions/"):
		s.transactionsHandler(w, r)
	default:
		s.rootHandler(w, r)
	}
}

func resolveRabbitURL() string {
	if os.Getenv("RABBITMQ_URL") != "" {
		return os.Getenv("RABBITMQ_URL")
	}
	host := os.Getenv("RABBITMQ_HOST")
	if host == "" {
		host = "rabbitmq"
	}
	port := os.Getenv("RABBITMQ_PORT")
	if port == "" {
		port = "5672"
	}
	username := os.Getenv("RABBITMQ_USERNAME")
	password := os.Getenv("RABBITMQ_PASSWORD")
	if username != "" && password != "" {
		return (&url.URL{
			Scheme: "amqp",
			User:   url.UserPassword(username, password),
			Host:   net.JoinHostPort(host, port),
			Path:   "/",
		}).String()
	}
	return fmt.Sprintf("amqp://%s:%s/", host, port)
}

func (s *Server) startRabbit() error {
	rabbitURL := resolveRabbitURL()
	if rabbitURL == "" {
		return fmt.Errorf("rabbitmq config missing")
	}
	conn, err := amqp.Dial(rabbitURL)
	if err != nil {
		return err
	}
	ch, err := conn.Channel()
	if err != nil {
		return err
	}
	_, err = ch.QueueDeclare(s.queueName, true, false, false, false, nil)
	if err != nil {
		return err
	}
	s.amqpConn = conn
	s.amqpCh = ch
	go s.consumeMessages()
	return nil
}

func (s *Server) consumeMessages() {
	if s.amqpCh == nil {
		return
	}
	msgs, err := s.amqpCh.Consume(s.queueName, "dispatch-service", false, false, false, false, nil)
	if err != nil {
		log.Printf("consume failed: %v", err)
		return
	}
	for msg := range msgs {
		if err := s.handleMessage(context.Background(), msg); err != nil {
			log.Printf("message failed: %v", err)
			if s.amqpCh != nil {
				_ = s.amqpCh.Nack(msg.DeliveryTag, false, true)
			}
		}
	}
}

func (s *Server) warnf(format string, args ...any) {
	if s.logger != nil {
		s.logger.Printf(format, args...)
		return
	}
	log.Printf(format, args...)
}

func (s *Server) handleMessage(ctx context.Context, msg amqp.Delivery) error {
	var event MeterEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		return err
	}
	ctx, span := s.tracer.Start(ctx, "dispatch.consume")
	defer span.End()
	span.SetAttributes(
		attribute.String("sre.scenario", os.Getenv("SRE_SCENARIO")),
		attribute.String("sre.service", os.Getenv("SRE_SERVICE")),
		attribute.String("sre.namespace", os.Getenv("SRE_NAMESPACE")),
		attribute.String("sre.component", os.Getenv("SRE_COMPONENT")),
		attribute.String("sre.version", os.Getenv("SRE_VERSION")),
		attribute.String("messaging.system", "rabbitmq"),
		attribute.String("messaging.destination", s.queueName),
		attribute.String("messaging.operation", "consume"),
		attribute.String("messaging.message.id", event.ID),
		attribute.String("correlation.id", event.CorrelationID),
		attribute.Bool("synthetic", event.Synthetic),
		attribute.String("synthetic.name", event.SyntheticName),
		attribute.String("synthetic.mode", event.SyntheticMode),
	)
	if s.persistence == nil {
		span.SetStatus(codes.Error, "persistence unavailable")
		span.RecordError(fmt.Errorf("persistence unavailable"))
		return fmt.Errorf("persistence unavailable")
	}
	saveCtx, saveSpan := s.tracer.Start(ctx, "mongo.save")
	saveSpan.SetAttributes(
		attribute.String("db.system", "mongodb"),
		attribute.String("db.operation", "insert"),
		attribute.String("sre.component", "mongodb"),
	)
	err := s.persistence.Save(saveCtx, event)
	switch {
	case err == nil:
		saveSpan.SetStatus(codes.Ok, "persisted")
	case errors.Is(err, ErrExpired):
		saveSpan.SetStatus(codes.Ok, "expired synthetic event ignored")
	default:
		saveSpan.SetStatus(codes.Error, err.Error())
		saveSpan.RecordError(err)
	}
	saveSpan.End()
	if err != nil {
		if errors.Is(err, ErrCorrelationConflict) {
			span.SetStatus(codes.Error, err.Error())
			span.RecordError(err)
			s.warnf("WARNING: discarding conflicting duplicate correlation id: %v", err)
			if s.amqpCh != nil {
				_ = s.amqpCh.Ack(msg.DeliveryTag, false)
			}
			return nil
		}
		if errors.Is(err, ErrExpired) {
			span.SetStatus(codes.Ok, "expired synthetic event ignored")
			if s.amqpCh != nil {
				_ = s.amqpCh.Ack(msg.DeliveryTag, false)
			}
			return nil
		}
		if errors.Is(err, ErrInvalidCorrelationID) {
			span.SetStatus(codes.Error, err.Error())
			span.RecordError(err)
			s.warnf("WARNING: discarding message with invalid correlation id (message_id=%q): %v", event.ID, err)
			if s.amqpCh != nil {
				_ = s.amqpCh.Ack(msg.DeliveryTag, false)
			}
			return nil
		}
		span.SetStatus(codes.Error, err.Error())
		span.RecordError(err)
		return err
	}
	span.SetStatus(codes.Ok, "processed")
	if s.amqpCh != nil {
		_ = s.amqpCh.Ack(msg.DeliveryTag, false)
	}
	return nil
}

func (s *Server) Run(ctx context.Context, addr string) error {
	if err := s.startRabbit(); err != nil {
		log.Printf("rabbitmq unavailable: %v", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.healthHandler)
	mux.HandleFunc("/transactions/", s.transactionsHandler)
	mux.HandleFunc("/", s.rootHandler)
	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		<-ctx.Done()
		_ = srv.Shutdown(context.Background())
	}()
	return srv.ListenAndServe()
}
