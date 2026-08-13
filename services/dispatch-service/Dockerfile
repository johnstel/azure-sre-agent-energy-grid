FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
COPY internal ./internal
COPY cmd ./cmd
RUN go build -o /out/dispatch-service ./cmd/dispatch-service

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/dispatch-service /app/dispatch-service
EXPOSE 3001
CMD ["/app/dispatch-service"]
