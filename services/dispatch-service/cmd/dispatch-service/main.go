package main

import (
    "context"
    "log"
    "os"

    "github.com/johnstel/azure-sre-agent-energy-grid/services/dispatch-service/internal/service"
)

func main() {
    _ = service.InitTracer()
    queueName := os.Getenv("RABBITMQ_QUEUE")
    if queueName == "" {
        queueName = "meter-events"
    }
    mongoURI := os.Getenv("MONGODB_URI")
    if mongoURI == "" {
        mongoURI = "mongodb://mongodb:27017"
    }
    dbName := os.Getenv("MONGODB_DB")
    if dbName == "" {
        dbName = "energydb"
    }
    collection := os.Getenv("MONGODB_COLLECTION")
    if collection == "" {
        collection = "meter_readings"
    }

    persistence, err := service.NewMongoPersistence(mongoURI, dbName, collection)
    if err != nil {
        log.Printf("mongo unavailable: %v", err)
    }
    srv := service.NewServer(persistence, queueName)
    port := os.Getenv("PORT")
    if port == "" {
        port = "3001"
    }
    log.Printf("dispatch-service listening on %s", port)
    if err := srv.Run(context.Background(), ":"+port); err != nil {
        log.Fatal(err)
    }
}
