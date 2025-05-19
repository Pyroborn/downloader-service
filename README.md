# Downloader Service

A microservice for handling file uploads and downloads using MinIO object storage.

## Features

- File upload to MinIO storage
- File download from MinIO storage
- User access control based on roles
- Metrics for monitoring
- Health checks for Kubernetes readiness/liveness probes

## Requirements

- Node.js 18+
- MinIO server
- RabbitMQ
- JWT authentication service

## Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on the `.env.example` template
4. Start the service:
   ```
   npm start
   ```

## Docker Development

1. Build the Docker image:
   ```
   npm run docker:build
   ```
2. Run the service with Docker:
   ```
   npm run docker:run
   ```

## Kubernetes Deployment

The service is designed to run in a Kubernetes environment with the following resources:

1. Create the Kubernetes resources:
   ```
   kubectl apply -f k8s/
   ```

2. For Minikube, build the image directly in Minikube's Docker:
   ```
   eval $(minikube docker-env)
   npm run docker:build
   kubectl apply -f k8s/
   ```

3. Required secrets:
   - `minio-credentials` with `access-key` and `secret-key`
   - `microservice-secrets` with `jwt-secret`

4. Environment variables are managed through:
   - ConfigMaps for non-sensitive data
   - Secrets for sensitive information
   - Direct values for standard configurations

## Testing

Run the tests:
```
npm test
```

For test coverage:
```
npm run test:coverage
```

## Metrics

Metrics are exposed on `/metrics` endpoint for Prometheus:
- Total download bytes
- Total upload bytes
- Download requests count
- Upload requests count 
- Active uploads gauge
- Active downloads gauge

## Health Checks

The service provides health check endpoints:
- `/health/live`: liveness probe
- `/health/ready`: readiness probe
- `/health`: combined health status

## API Endpoints

### File Operations
- `GET /files/list`: Get a list of files accessible to the user
- `POST /files/upload`: Upload a file
- `GET /files/download/:key`: Download a file
- `DELETE /files/:key`: Delete a file

### Debug
- `GET /debug-token`: Debug endpoint for JWT token verification

## Configuration

Configuration is managed through environment variables:
- `PORT`: The port the service runs on (default: 3004)
- `JWT_SECRET`: Secret for verifying JWT tokens
- `MINIO_ENDPOINT`: MinIO server endpoint
- `MINIO_ACCESS_KEY`: MinIO access key
- `MINIO_SECRET_KEY`: MinIO secret key
- `MINIO_BUCKET`: MinIO bucket name
- `USE_SSL`: Whether to use SSL for MinIO
- `RABBITMQ_URL`: RabbitMQ server URL
- `ALLOWED_ORIGINS`: CORS allowed origins