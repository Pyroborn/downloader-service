const promClient = require('prom-client');

// Registry for metrics
const register = new promClient.Registry();

// Default labels
register.setDefaultLabels({
    app: 'downloader-service'
});

// Default metrics collection
promClient.collectDefaultMetrics({ register });

// Download bytes counter
const downloadBytesTotal = new promClient.Counter({
    name: 'download_bytes_total',
    help: 'Total number of bytes downloaded',
    labelNames: ['status', 'userId']
});

// Download requests counter
const downloadRequestsTotal = new promClient.Counter({
    name: 'download_requests_total',
    help: 'Total number of download requests',
    labelNames: ['status', 'userId']
});

// Upload bytes counter
const uploadBytesTotal = new promClient.Counter({
    name: 'upload_bytes_total',
    help: 'Total number of bytes uploaded',
    labelNames: ['status', 'userId']
});

// Upload requests counter
const uploadRequestsTotal = new promClient.Counter({
    name: 'upload_requests_total',
    help: 'Total number of upload requests',
    labelNames: ['status', 'userId']
});

// Active downloads gauge
const activeDownloadsGauge = new promClient.Gauge({
    name: 'active_downloads_current',
    help: 'Number of downloads currently being processed'
});

// Active uploads gauge
const activeUploadsGauge = new promClient.Gauge({
    name: 'active_uploads_current',
    help: 'Number of uploads currently being processed'
});

// HTTP request duration metric
const httpRequestDurationMicroseconds = new promClient.Summary({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    percentiles: [0.5, 0.9, 0.99]
});

// RabbitMQ queue size metric
const rabbitmqQueueSizeGauge = new promClient.Gauge({
    name: 'rabbitmq_queue_size',
    help: 'Number of messages in RabbitMQ queue',
    labelNames: ['queue']
});

// Register all metrics
register.registerMetric(downloadBytesTotal);
register.registerMetric(downloadRequestsTotal);
register.registerMetric(uploadBytesTotal);
register.registerMetric(uploadRequestsTotal);
register.registerMetric(activeDownloadsGauge);
register.registerMetric(activeUploadsGauge);
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(rabbitmqQueueSizeGauge);

module.exports = {
    register,
    metrics: {
        downloadBytesTotal,
        downloadRequestsTotal,
        uploadBytesTotal,
        uploadRequestsTotal,
        activeDownloadsGauge,
        activeUploadsGauge,
        httpRequestDurationMicroseconds,
        rabbitmqQueueSizeGauge
    }
}; 