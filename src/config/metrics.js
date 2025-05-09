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
    labelNames: ['status']
});

// Create a counter for download requests
const downloadRequestsTotal = new promClient.Counter({
    name: 'download_requests_total',
    help: 'Total number of download requests',
    labelNames: ['status']
});

// Create a counter for upload bytes
const uploadBytesTotal = new promClient.Counter({
    name: 'upload_bytes_total',
    help: 'Total number of bytes uploaded',
    labelNames: ['status']
});

// Create a counter for upload requests
const uploadRequestsTotal = new promClient.Counter({
    name: 'upload_requests_total',
    help: 'Total number of upload requests',
    labelNames: ['status']
});

// Registering download & upload Bytes and Requests Total metrics
register.registerMetric(downloadBytesTotal);
register.registerMetric(downloadRequestsTotal);
register.registerMetric(uploadBytesTotal);
register.registerMetric(uploadRequestsTotal);

module.exports = {
    register,
    metrics: {
        downloadBytesTotal,
        downloadRequestsTotal,
        uploadBytesTotal,
        uploadRequestsTotal
    }
}; 