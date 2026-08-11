package service

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/streadway/amqp"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
    "go.opentelemetry.io/otel/codes"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/trace"
)

type MeterEvent struct {
    ID            string  `json:"id"`
    MeterID       string  `json:"meterId"`
    Reading       float64 `json:"reading"`
    Zone          string  `json:"zone"`
    ObservedAt    string  `json:"observedAt"`
    CorrelationID string  `json:"correlationId"`
}

type Persistence interface {
    Save(context.Context, MeterEvent) error
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
    return &MongoPersistence{client: client, dbName: dbName, collection: collection}, nil
}

func (p *MongoPersistence) Save(ctx context.Context, event MeterEvent) error {
    if p.client == nil {
        return fmt.Errorf("mongo client not initialized")
    }
    collection := p.client.Database(p.dbName).Collection(p.collection)
    _, err := collection.InsertOne(ctx, event)
    return err
}

type Server struct {
    persistence Persistence
    queueName   string
    tracer      trace.Tracer
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
    return &Server{persistence: persistence, queueName: queueName, tracer: otel.Tracer("dispatch-service")}
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

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    switch r.URL.Path {
    case "/health":
        s.healthHandler(w, r)
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
        return fmt.Sprintf("amqp://%s:%s@%s:%s/", username, password, host, port)
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
    saveSpan.End()
    if err != nil {
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
    mux.HandleFunc("/", s.rootHandler)
    srv := &http.Server{Addr: addr, Handler: mux}
    go func() {
        <-ctx.Done()
        _ = srv.Shutdown(context.Background())
    }()
    return srv.ListenAndServe()
}
