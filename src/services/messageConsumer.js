const fileService = require('./fileService');
const rabbitmq = require('../config/rabbitmq');

// Create a deduplication cache to prevent duplicate message processing
// This is critical for HPA scenarios where multiple instances might process the same message
const processedMessages = new Map();
const MESSAGE_CACHE_TTL = 60000; // 1 minute TTL for processed message IDs

// Function to check if a message has been processed recently
function isMessageDuplicate(messageId) {
    return processedMessages.has(messageId);
}

// Function to mark a message as processed
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
            // Connect to RabbitMQ
            await rabbitmq.connect();
            
            // Start consuming from upload queue only
            await rabbitmq.consumeQueue(rabbitmq.queues.upload, 
                this.handleUploadMessage.bind(this));
            
            this.isInitialized = true;
            console.log('Message consumer initialized for uploads only');
        } catch (error) {
            console.error('Failed to initialize message consumer:', error);
            // Retry initialization after delay
            setTimeout(() => this.initialize(), 5000);
        }
    }

    // Handle file upload message
    async handleUploadMessage(message, properties) {
        try {
            // Check if we've recently processed this message (based on messageId or content hash)
            const messageId = properties?.messageId || JSON.stringify(message);
            
            if (isMessageDuplicate(messageId)) {
                console.log(`Skipping duplicate message: ${messageId.substring(0, 20)}...`);
                return { skipped: true, reason: 'duplicate' };
            }
            
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
            
            // Minimal logging with just the filename
            const originalName = message.file.originalname || 'unknown';
            console.log(`Processing upload via queue: ${originalName} (${userId})`);
            
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
            
            // Log success with minimal info
            console.log(`Upload completed via queue: ${result.key.split('/').pop()}`);
            
            // Mark this message as processed to prevent duplicate processing
            markMessageProcessed(messageId);
            
            return result;
        } catch (error) {
            console.error('Error processing upload message:', error);
            throw error;
        }
    }

    // Handle file download message
    async handleDownloadMessage(message) {
        try {
            // We should not be receiving download messages via RabbitMQ anymore
            // Downloads are now handled directly in the HTTP route
            // This is kept for backward compatibility
            
            // Validate message
            if (!message.key || !message.user) {
                throw new Error('Invalid download message: missing key or user');
            }
            
            // Log warning about unexpected message
            console.warn(`UNEXPECTED: Download message received via queue for: ${message.key.split('/').pop()}`);
            
            // Check file access
            const canAccess = await fileService.checkFileAccess(message.key, message.user.userId, message.user.role);
            if (!canAccess) {
                throw new Error('Access denied to this file');
            }
            
            // Download file using fileService
            const file = await fileService.downloadFile(message.key, message.user);
            
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