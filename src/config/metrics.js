const promClient = require('prom-client');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'downloader-service'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Create a counter for download bytes
const downloadBytesTotal = new promClient.Counter({
    name: 'download_bytes_total',
    help: 'Total number of bytes downloaded',
    labelNames: ['status', 'userId']
});

// Create a counter for download requests
const downloadRequestsTotal = new promClient.Counter({
    name: 'download_requests_total',
    help: 'Total number of download requests',
    labelNames: ['status', 'userId']
});

// Create a counter for upload bytes
const uploadBytesTotal = new promClient.Counter({
    name: 'upload_bytes_total',
    help: 'Total number of bytes uploaded',
    labelNames: ['status', 'userId']
});

// Create a counter for upload requests
const uploadRequestsTotal = new promClient.Counter({
    name: 'upload_requests_total',
    help: 'Total number of upload requests',
    labelNames: ['status', 'userId']
});

// Gauge for current active downloads - good for autoscaling
const activeDownloadsGauge = new promClient.Gauge({
    name: 'active_downloads_current',
    help: 'Number of downloads currently being processed'
});

// Gauge for current active uploads - good for autoscaling
const activeUploadsGauge = new promClient.Gauge({
    name: 'active_uploads_current',
    help: 'Number of uploads currently being processed'
});

// HTTP Request duration summary - useful for monitoring service performance
const httpRequestDurationMicroseconds = new promClient.Summary({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    percentiles: [0.5, 0.9, 0.99]
});

// RabbitMQ queue size gauge - useful for autoscaling based on queue depth
const rabbitmqQueueSizeGauge = new promClient.Gauge({
    name: 'rabbitmq_queue_size',
    help: 'Number of messages in RabbitMQ queue',
    labelNames: ['queue']
});

// Registering all metrics
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