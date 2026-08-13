FROM rust:1.95-alpine AS build
WORKDIR /app
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /app/target/release/asset-service /app/asset-service
EXPOSE 3002
CMD ["/app/asset-service"]
