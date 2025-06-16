const express = require('express');
const cors = require('cors');
require('dotenv').config();

const fileRoutes = require('./routes/fileRoutes');
const { register } = require('./config/metrics');
const rabbitmq = require('./config/rabbitmq');
const messageConsumer = require('./services/messageConsumer');

const app = express();
const port = process.env.PORT || 3004;

// CORS Configuration
if (process.env.NODE_ENV === 'development') {
    const allowedOrigins = ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3003'];
    app.use(cors({
        origin: function(origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                return callback(null, true);
            } else {
                return callback(null, false);
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['Content-Disposition'],
        credentials: true,
        preflightContinue: false
    }));
    console.log('CORS enabled for development origins');
} else {
    // CORS configuration for production
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
    app.use(cors({
        origin: function(origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                return callback(null, true);
            } else {
                return callback(null, false);
            }
        },
        methods: process.env.CORS_METHODS ? process.env.CORS_METHODS.split(',') : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: process.env.CORS_HEADERS ? process.env.CORS_HEADERS.split(',') : ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Disposition'],
        credentials: process.env.CORS_CREDENTIALS === 'true'
    }));
    console.log('CORS enabled for specified origins in production mode');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    if (!req.path.includes('/health') && !req.path.includes('/metrics')) {
        if (req.path.includes('/download/')) {
            const filename = req.path.split('/').pop().split('?')[0];
            console.log(`${new Date().toISOString().split('T')[1]} - ${req.method} Download: ${filename}`);
        } 
        else if (!req.path.includes('/debug')) {
            console.log(`${new Date().toISOString().split('T')[1]} - ${req.method} ${req.path.split('/').slice(0, 3).join('/')}`);
        }
    }
    next();
});

// Request metrics middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;
        
        if (!req.path.includes('/metrics') && !req.path.includes('/health')) {
            const route = req.route?.path || 
                req.path.replace(/\/[0-9a-f-]{36}\//g, '/:id/').replace(/\/[0-9]+\//g, '/:id/');
                
            const { metrics } = require('./config/metrics');
            metrics.httpRequestDurationMicroseconds.observe(
                { 
                    method: req.method, 
                    route, 
                    status_code: res.statusCode 
                }, 
                duration
            );
            
            if (res.statusCode >= 400 || duration > 1.0) {
                console.log(`Request ${req.method} ${req.path} completed in ${duration.toFixed(3)}s with status ${res.statusCode}`);
            }
        }
    });
    
    next();
});

// Handling preflight requests
app.options('*', cors());

// Initializing RabbitMQ connection and message consumer
(async () => {
    try {
        await rabbitmq.connect();
        console.log('RabbitMQ connection established');
        
        // Initializing message consumer
        await messageConsumer.initialize();
        console.log('Message consumer initialized');
    } catch (error) {
        console.error('Failed to initialize RabbitMQ or message consumer:', error);
    }
})();

// Routes
app.use('/api/files', fileRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        rabbitMQ: rabbitmq.connection ? 'connected' : 'disconnected'
    });
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        message: 'Not Found',
        path: req.path
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);

    if (err.message === 'Access denied') {
        return res.status(403).json({
            message: 'Access denied',
            error: 'You do not have permission to access this resource'
        });
    }

    if (err.message === 'File not found') {
        return res.status(404).json({
            message: 'File not found',
            error: 'The requested file does not exist'
        });
    }

    res.status(err.status || 500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
});

// Start server
const server = app.listen(port, () => {
    console.log(`Downloader service running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server and RabbitMQ connections');
    server.close(async () => {
        console.log('HTTP server closed');
        await rabbitmq.closeConnection();
        process.exit(0);
    });
}); 