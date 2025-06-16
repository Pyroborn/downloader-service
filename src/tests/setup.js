// Load test environment variables
require('dotenv').config({ path: '.env.test' });

// Set default environment variables if not present
process.env.MINIO_BUCKET = process.env.MINIO_BUCKET || 'test-bucket';
process.env.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://minio:9000';
process.env.MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'test-access-key';
process.env.MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'test-secret-key';
process.env.PORT = process.env.PORT || '3000';

// Set test timeout
jest.setTimeout(10000);

// Mock metrics module
jest.mock('../config/metrics', () => ({
    metrics: {
        uploadRequestsTotal: {
            inc: jest.fn()
        },
        downloadRequestsTotal: {
            inc: jest.fn()
        },
        uploadBytesTotal: {
            inc: jest.fn()
        },
        downloadBytesTotal: {
            inc: jest.fn()
        },
        deleteRequestsTotal: {
            inc: jest.fn()
        },
        listRequestsTotal: {
            inc: jest.fn()
        },
        activeUploadsGauge: {
            inc: jest.fn(),
            dec: jest.fn()
        },
        activeDownloadsGauge: {
            inc: jest.fn(),
            dec: jest.fn()
        }
    }
})); 