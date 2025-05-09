# Downloader Service

A Node.js service for handling file uploads and downloads using MinIO as the storage backend.

## Features

- File upload with automatic key generation
- File download by key
- File deletion
- MinIO integration using AWS S3 SDK
- Support for any file type
- 10MB file size limit (configurable)

## Prerequisites

- Node.js 14+
- MinIO server running (accessible at http://minio-service:9000)
- MinIO credentials (access key and secret key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   Create a `.env` file with the following variables:
   ```
   PORT=3004
   MINIO_ENDPOINT=http://minio-service:9000
   MINIO_ACCESS_KEY=********
   MINIO_SECRET_KEY=********
   MINIO_BUCKET=files
   USE_SSL=false
   ```

3. Start the service:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## API Endpoints

### Upload File
- **POST** `/api/files/upload`
- Content-Type: `multipart/form-data`
- Body: `file` (file field)
- Response: 
  ```json
  {
    "key": "1234567890-filename.ext",
    "location": "http://minio-service:9000/files/1234567890-filename.ext",
    "mimetype": "application/octet-stream"
  }
  ```

### Download File
- **GET** `/api/files/download/:key`
- Response: File stream with appropriate headers

### Delete File
- **DELETE** `/api/files/:key`
- Response:
  ```json
  {
    "message": "File deleted successfully"
  }
  ```

### Health Check
- **GET** `/health`
- Response:
  ```json
  {
    "status": "healthy"
  }
  ```

## Error Handling

The service includes comprehensive error handling for:
- File not found
- Upload failures
- Download failures
- Invalid file types
- File size exceeded
- Server errors

## Security

- File size limit of 10MB (configurable in routes)
- CORS enabled
- Environment variable configuration
- No virtual hosted bucket style (path style access)
- Custom credentials support 


## jenkins pipeline config

Create these credentials in Jenkins:
minio-test-access-key
minio-test-secret-key

Install these Jenkins plugins:
JUnit plugin
HTML Publisher plugin
NodeJS plugin

Configure NodeJS in Jenkins global tool configuration

Make sure your Jenkins agent has nvm installed or configure the NodeJS plugin properly