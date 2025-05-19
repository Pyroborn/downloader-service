const fileService = require('./fileService');
const rabbitmq = require('../config/rabbitmq');

class MessageConsumer {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Connect to RabbitMQ
            await rabbitmq.connect();
            
            // Start consuming from upload queue
            await rabbitmq.consumeQueue(rabbitmq.queues.upload, 
                this.handleUploadMessage.bind(this));
            
            // Start consuming from download queue
            await rabbitmq.consumeQueue(rabbitmq.queues.download, 
                this.handleDownloadMessage.bind(this));
            
            this.isInitialized = true;
            console.log('Message consumer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize message consumer:', error);
            // Retry initialization after delay
            setTimeout(() => this.initialize(), 5000);
        }
    }

    // Handle file upload message
    async handleUploadMessage(message) {
        try {
            console.log('Processing upload message:', message);
            
            // Validate message
            if (!message.file || !message.metadata) {
                throw new Error('Invalid upload message: missing file or metadata');
            }
            
            // Ensure both id and userId are set for consistency
            const metadata = { ...message.metadata };
            const userId = metadata.userId || metadata.id;
            
            if (!userId) {
                throw new Error('Invalid upload message: missing userId or id in metadata');
            }
            
            // Update metadata to have consistent IDs
            metadata.id = userId;
            metadata.userId = userId;
            
            console.log(`Processing upload for user ID: ${userId}, role: ${metadata.role || 'user'}`);
            
            // Create a Buffer from base64 string if it's a string
            let fileBuffer;
            if (typeof message.file.buffer === 'string') {
                fileBuffer = Buffer.from(message.file.buffer, 'base64');
            } else if (Array.isArray(message.file.buffer)) {
                fileBuffer = Buffer.from(message.file.buffer);
            } else {
                throw new Error('Invalid file buffer format');
            }
            
            // Create file object for fileService
            const file = {
                buffer: fileBuffer,
                originalname: message.file.originalname,
                mimetype: message.file.mimetype,
                size: message.file.size
            };
            
            // Upload file using fileService
            const result = await fileService.uploadFile(file, metadata);
            console.log('File uploaded successfully:', result.key);
            
            return result;
        } catch (error) {
            console.error('Error processing upload message:', error);
            throw error;
        }
    }

    // Handle file download message
    async handleDownloadMessage(message) {
        try {
            console.log('Processing download message:', message);
            
            // Validate message
            if (!message.key || !message.user) {
                throw new Error('Invalid download message: missing key or user');
            }
            
            // Check file access
            const canAccess = await fileService.checkFileAccess(message.key, message.user.userId, message.user.role);
            if (!canAccess) {
                throw new Error('Access denied to this file');
            }
            
            // Download file using fileService
            const file = await fileService.downloadFile(message.key, message.user);
            console.log('File downloaded successfully:', message.key);
            
            // Return file metadata (we don't return the actual file in the queue response)
            return {
                key: message.key,
                ContentType: file.ContentType,
                ContentLength: file.ContentLength,
                LastModified: file.LastModified,
                Metadata: file.Metadata
            };
        } catch (error) {
            console.error('Error processing download message:', error);
            throw error;
        }
    }
}

module.exports = new MessageConsumer(); 