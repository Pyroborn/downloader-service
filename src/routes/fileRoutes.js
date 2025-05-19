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
        // Debug the user object in the request
        console.log('User info in list request:', {
            userId: req.user.userId,
            id: req.user.id,
            role: req.user.role
        });

        // Ensure we have a consistent user object with both userId and id properties
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

// Download file function - Protected and Using RabbitMQ
// Allow token in URL query parameter
router.get('/download/:key(*)', async (req, res) => {
    try {
        const { key } = req.params;
        // Decode the key in case it was URL-encoded
        const decodedKey = decodeURIComponent(key);
        
        console.log(`Download requested for file with key: ${decodedKey}`);
        
        let token;
        
        // Check for token in Authorization header first
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        
        // If token not found in header, check URL query parameter
        if (!token && req.query.token) {
            token = req.query.token;
            console.log('Using token from URL query parameter');
        }
        
        // If no token provided, return unauthorized
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify the token
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
            console.error('Token verification failed:', error.message);
            return res.status(401).json({ 
                error: 'Invalid token: ' + error.message
            });
        }
        
        // Check if user has access to the file
        const canAccess = await fileService.checkFileAccess(decodedKey, req.user.userId, req.user.role);
        if (!canAccess) {
            return res.status(403).json({ message: 'Access denied to this file' });
        }

        // Create message for download queue
        const message = {
            key: decodedKey,
            user: {
                userId: req.user.userId,
                role: req.user.role
            }
        };

        // Send download request to queue
        await rabbitmq.sendToQueue(rabbitmq.queues.download, message);

        // Download directly for the HTTP response since we need to stream the file
        const file = await fileService.downloadFile(decodedKey, req.user);
        
        // Extract filename from the key, removing any potential path prefixes
        const filename = decodedKey.split('/').pop();
        
        // Set the appropriate headers
        res.setHeader('Content-Type', file.ContentType || 'application/octet-stream');
        if (file.ContentLength) {
            res.setHeader('Content-Length', file.ContentLength);
        }
        
        // Use encodeURIComponent for filename to handle special characters properly
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"`);
        
        // Set additional headers to prevent caching for better download experience
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Pipe the file stream to the response
        file.Body.pipe(res);
        
        // Handle errors in the stream
        file.Body.on('error', (streamError) => {
            console.error('Stream error during download:', streamError);
            // If headers are not sent yet, send an error response
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error streaming file data' });
            } else {
                // If headers are already sent, destroy the stream
                res.destroy();
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Failed to download file' });
    }
});

// Delete file function - Protected
router.delete('/:key(*)', authMiddleware, async (req, res) => {
    try {
        const { key } = req.params;
        // Decode the key in case it was URL-encoded
        const decodedKey = decodeURIComponent(key);
        
        console.log(`Delete requested for file with key: ${decodedKey}`);

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