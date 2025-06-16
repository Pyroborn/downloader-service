const fileService = require('./fileService');
const rabbitmq = require('../config/rabbitmq');

// Deduplication cache for message processing
const processedMessages = new Map();
const MESSAGE_CACHE_TTL = 60000; // 1 minute TTL

// Check for duplicate messages
function isMessageDuplicate(messageId) {
    return processedMessages.has(messageId);
}

// Mark message as processed
function markMessageProcessed(messageId) {
    processedMessages.set(messageId, Date.now());
    
    // Clean up old entries every 100 messages
    if (processedMessages.size > 100) {
        const now = Date.now();
        for (const [id, timestamp] of processedMessages.entries()) {
            if (now - timestamp > MESSAGE_CACHE_TTL) {
                processedMessages.delete(id);
            }
        }
    }
}

class MessageConsumer {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            await rabbitmq.connect();
            
            await rabbitmq.consumeQueue(rabbitmq.queues.upload, 
                this.handleUploadMessage.bind(this));
            
            this.isInitialized = true;
            console.log('Message consumer initialized for uploads only');
        } catch (error) {
            console.error('Failed to initialize message consumer:', error);
            setTimeout(() => this.initialize(), 5000);
        }
    }

    async handleUploadMessage(message, properties) {
        try {
            const messageId = properties?.messageId || JSON.stringify(message);
            
            if (isMessageDuplicate(messageId)) {
                console.log(`Skipping duplicate message: ${messageId.substring(0, 20)}...`);
                return { skipped: true, reason: 'duplicate' };
            }
            
            if (!message.file || !message.metadata) {
                throw new Error('Invalid upload message: missing file or metadata');
            }
            
            const metadata = { ...message.metadata };
            const userId = metadata.userId || metadata.id;
            
            if (!userId) {
                throw new Error('Invalid upload message: missing userId or id in metadata');
            }
            
            // Ensure consistent ID properties
            metadata.id = userId;
            metadata.userId = userId;
            
            const originalName = message.file.originalname || 'unknown';
            console.log(`Processing upload via queue: ${originalName} (${userId})`);
            
            // Convert buffer from various formats
            let fileBuffer;
            if (typeof message.file.buffer === 'string') {
                fileBuffer = Buffer.from(message.file.buffer, 'base64');
            } else if (Array.isArray(message.file.buffer)) {
                fileBuffer = Buffer.from(message.file.buffer);
            } else {
                throw new Error('Invalid file buffer format');
            }
            
            const file = {
                buffer: fileBuffer,
                originalname: message.file.originalname,
                mimetype: message.file.mimetype,
                size: message.file.size
            };
            
            const result = await fileService.uploadFile(file, metadata);
            
            console.log(`Upload completed via queue: ${result.key.split('/').pop()}`);
            
            markMessageProcessed(messageId);
            
            return result;
        } catch (error) {
            console.error('Error processing upload message:', error);
            throw error;
        }
    }

    async handleDownloadMessage(message) {
        try {
            // Downloads are handled directly in HTTP routes
            // This is kept for backward compatibility
            
            if (!message.key || !message.user) {
                throw new Error('Invalid download message: missing key or user');
            }
            
            console.warn(`UNEXPECTED: Download message received via queue for: ${message.key.split('/').pop()}`);
            
            const canAccess = await fileService.checkFileAccess(message.key, message.user.userId, message.user.role);
            if (!canAccess) {
                throw new Error('Access denied to this file');
            }
            
            const file = await fileService.downloadFile(message.key, message.user);
            
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