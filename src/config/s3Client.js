const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: 'us-east-1', // MinIO doesn't require specific region
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY,
        secretAccessKey: process.env.MINIO_SECRET_KEY
    },
    forcePathStyle: true, // Required for MinIO
    signatureVersion: 'v4'
});

module.exports = s3Client; 