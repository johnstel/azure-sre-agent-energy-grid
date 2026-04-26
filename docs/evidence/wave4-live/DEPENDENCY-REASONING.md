# Dependency Reasoning — MongoDBDown

## Scenario

`mongodb-down` scales the `mongodb` Deployment to zero replicas. This breaks the data dependency used by `dispatch-service` and can surface as multiple symptoms.

## Dependency chain

```text
meter-service
  └── publishes meter events to RabbitMQ
dispatch-service
  ├── consumes meter events from RabbitMQ
  └── writes readings to MongoDB via ORDER_DB_URI=mongodb://mongodb:27017
mongodb
  └── scaled to replicas: 0 in k8s/scenarios/mongodb-down.yaml
```

## Reasoning path for SRE Agent

1. Start with user-visible symptom: meter readings are not processed.
2. Inspect dependent services, especially `dispatch-service`.
3. Read `dispatch-service` environment: `ORDER_DB_URI` points to `mongodb://mongodb:27017`.
4. Inspect `mongodb` Deployment desired state.
5. Identify root cause: `replicas: 0`.
6. Treat `dispatch-service` crashes/restarts and queue backlog as symptoms of the database outage, not separate primary incidents.
7. Recommend restoring MongoDB through `kubectl apply -f k8s/base/application.yaml`.

## Existing evidence

- Wave 2 MongoDBDown status confirms root cause evidence: `replicas: 0` in deployment YAML.
- Wave 2 recorded `NO_ALERT_FIRED` for the rapid automated run because the scenario was restored before alert evaluation windows had enough time.
- SRE Agent portal diagnosis remains `PENDING_HUMAN_PORTAL`.

## KQL boundary

`docs/evidence/kql/stable/scenario-mongodb-down.kql` can show symptom evidence such as pod observations and dependent service errors. It cannot prove desired replica count or endpoint membership; kubectl/Kubernetes API evidence is required for root cause proof.

## Demo-safe summary

> "MongoDBDown is a dependency-root-cause scenario: several downstream symptoms can appear, but the primary fix is restoring MongoDB replicas. Current evidence proves the Kubernetes root cause; portal validation is still required before claiming the SRE Agent identified it."
