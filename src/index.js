const express = require('express');
const cors = require('cors');
require('dotenv').config();

const fileRoutes = require('./routes/fileRoutes');
const { register } = require('./config/metrics');

const app = express();
const port = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/files', fileRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        console.error('Error generating metrics:', error);
        res.status(500).json({ error: 'Error generating metrics' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(port, () => {
    console.log(`Downloader service running on port ${port}`);
}); 