const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileService = require('../services/fileService');
const authMiddleware = require('../middleware/auth');
const rabbitmq = require('../config/rabbitmq');
const jwt = require('jsonwebtoken');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Debug route - NO AUTH - REMOVE IN PRODUCTION
router.get('/debug-token', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        
        console.log('----- DEBUG TOKEN INFO -----');
        console.log('Authorization header present:', !!authHeader);
        console.log('Token present:', !!token);
        
        if (token) {
            console.log('Token first 20 chars:', token.substring(0, 20) + '...');
            
            // Try to decode without verification first
            try {
                const decoded = jwt.decode(token);
                console.log('Token payload:', decoded);
                
                // Now try verifying
                try {
                    const JWT_SECRET = (process.env.JWT_SECRET || 'your-secret-key').trim();
                    console.log('Using JWT_SECRET:', JWT_SECRET.substring(0, 5) + '...', 'length:', JWT_SECRET.length);
                    const verified = jwt.verify(token, JWT_SECRET);
                    console.log('Token verification: SUCCESS');
                    res.json({
                        status: 'success',
                        message: 'Token is valid',
                        decoded: verified
                    });
                } catch (verifyError) {
                    console.log('Token verification: FAILED -', verifyError.message);
                    res.json({
                        status: 'error',
                        message: 'Token verification failed',
                        error: verifyError.message
                    });
                }
            } catch (decodeError) {
                console.log('Token decode error:', decodeError.message);
                res.json({
                    status: 'error',
                    message: 'Token is malformed',
                    error: decodeError.message
                });
            }
        } else {
            res.json({
                status: 'error',
                message: 'No token provided'
            });
        }
    } catch (error) {
        console.error('Debug route error:', error);
        res.status(500).json({ message: 'Error in debug route' });
    }
});

// List files function - Protected
router.get('/list', authMiddleware, async (req, res) => {
    try {
        // Use a consistent user object with both userId and id properties
        const userInfo = {
            userId: req.user.userId,
            id: req.user.userId, // Add id property with same value for compatibility
            role: req.user.role || 'user'
        };
        
        const files = await fileService.listFiles(userInfo);
        res.json(files);
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ message: 'Failed to list files' });
    }
});

// Upload file function - Protected and Using RabbitMQ
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const metadata = {
            id: req.user.userId,
            uploadedBy: req.user.name || req.user.email,
            originalName: req.file.originalname,
            role: req.user.role
        };

        // Create message for queue
        const message = {
            file: {
                buffer: req.file.buffer.toString('base64'), // Convert buffer to base64 string for queue
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            },
            metadata: metadata
        };

        // Send to RabbitMQ queue
        const success = await rabbitmq.sendToQueue(rabbitmq.queues.upload, message);
        
        if (!success) {
            throw new Error('Failed to queue upload request');
        }

        // Return a response immediately while processing continues in background
        res.status(202).json({ 
            message: 'File upload queued for processing',
            fileName: req.file.originalname,
            status: 'processing'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Failed to queue upload' });
    }
});

// Download file function (direct streaming without RabbitMQ)
router.get('/download/:key(*)', async (req, res) => {
    let file = null;
    
    try {
        const { key } = req.params;
        // Decode the key in case it was URL-encoded
        const decodedKey = decodeURIComponent(key);
        const filename = decodedKey.split('/').pop();
        
        // Process authentication token - check header first, then query parameter
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.query.token) {
            token = req.query.token;
        }
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify token
        try {
            const JWT_SECRET = (process.env.JWT_SECRET || 'your-secret-key').trim();
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = {
                userId: decoded.userId || decoded.id,
                role: decoded.role || 'user',
                name: decoded.name,
                email: decoded.email
            };
        } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Check access permissions
        const canAccess = await fileService.checkFileAccess(decodedKey, req.user.userId, req.user.role);
        if (!canAccess) {
            return res.status(403).json({ message: 'Access denied to this file' });
        }

        // Use a single request ID to track this download and detect duplicates
        const requestId = req.query.requestId || Date.now();
        
        // Get the file from storage - this is the only place we handle file downloads now
        file = await fileService.downloadFile(decodedKey, req.user);
        
        // Set appropriate headers for download
        res.setHeader('Content-Type', file.ContentType || 'application/octet-stream');
        if (file.ContentLength) {
            res.setHeader('Content-Length', file.ContentLength);
        }
        
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Request-ID', requestId);
        
        // Pipe the file directly to response
        file.Body.pipe(res);
        
        // Log success once the file is completely sent (in the 'finish' event)
        res.on('finish', () => {
            console.log(`Download completed for: ${filename}`);
        });
    } catch (error) {
        // Only log errors, not regular operation
        console.error('Download error:', error.message);
        
        // If headers not sent yet, return error response
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to download file' });
        } else if (file && file.Body) {
            // If we already started streaming but encountered an error
            file.Body.destroy();
            res.destroy();
        }
    }
});

// Delete file function - Protected
router.delete('/:key(*)', authMiddleware, async (req, res) => {
    try {
        const { key } = req.params;
        const decodedKey = decodeURIComponent(key);
        const filename = decodedKey.split('/').pop();

        // Check if user has access to delete the file
        const canDelete = await fileService.checkFileAccess(decodedKey, req.user.userId, req.user.role);
        if (!canDelete) {
            return res.status(403).json({ message: 'Not authorized to delete this file' });
        }

        await fileService.deleteFile(decodedKey, req.user);
        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Failed to delete file' });
    }
});

module.exports = router; 