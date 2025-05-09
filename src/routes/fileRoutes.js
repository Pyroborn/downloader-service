const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileService = require('../services/fileService');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit defined here
    }
});

// List files function
router.get('/list', async (req, res) => {
    try {
        const files = await fileService.listFiles();
        res.json(files);
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ message: 'Failed to list files' });
    }
});

// Upload file function
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const result = await fileService.uploadFile(req.file);
        res.status(201).json(result);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Failed to upload file' });
    }
});

// Download file function
router.get('/download/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const file = await fileService.downloadFile(key);
        
        // Set the appropriate headers
        res.setHeader('Content-Type', file.ContentType);
        res.setHeader('Content-Length', file.ContentLength);
        res.setHeader('Content-Disposition', `attachment; filename="${key}"`);
        
        // Pipe the file stream to the response
        file.Body.pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ message: 'Failed to download file' });
    }
});

// Delete file function
router.delete('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        await fileService.deleteFile(key);
        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Failed to delete file' });
    }
});

module.exports = router; 