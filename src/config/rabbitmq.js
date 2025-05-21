const amqp = require('amqplib');
const { metrics } = require('./metrics'); 
const crypto = require('crypto');
require('dotenv').config();

// RabbitMQ configuration
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const queueUpload = process.env.RABBITMQ_QUEUE_UPLOAD || 'file_upload_queue';
const queueDownload = process.env.RABBITMQ_QUEUE_DOWNLOAD || 'file_download_queue';

// Create connection and channel
let connection = null;
let channel = null;

// Generate a unique message ID for deduplication
function generateMessageId(message) {
    // Create a deterministic hash of the message content
    if (typeof message === 'object') {
        // For upload messages, create a hash from user ID and file name/size
        if (message.file && message.metadata) {
            const { originalname, size } = message.file;
            const userId = message.metadata.id || message.metadata.userId;
            return crypto.createHash('md5')
                .update(`${userId}-${originalname}-${size}-${Date.now()}`)
                .digest('hex');
        }
        
        // For download messages, use the key and user ID
        if (message.key && message.user) {
            const { key } = message;
            const userId = message.user.userId;
            return crypto.createHash('md5')
                .update(`${userId}-${key}-${Date.now()}`)
                .digest('hex');
        }
    }
    
    // Fallback to a random ID + timestamp
    return `${crypto.randomBytes(8).toString('hex')}-${Date.now()}`;
}

// Connect to RabbitMQ
async function connect() {
    try {
        connection = await amqp.connect(rabbitmqUrl);
        channel = await connection.createChannel();
        
        // Ensure queues exist
        await channel.assertQueue(queueUpload, { durable: true });
        await channel.assertQueue(queueDownload, { durable: true });
        
        console.log('Connected to RabbitMQ');
        
        // Start queue monitoring
        setInterval(updateQueueMetrics, 5000);
        
        return { connection, channel };
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
        // Retry connection after delay
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connect, 5000);
    }
}

// Update metrics about queue sizes - useful for autoscaling
async function updateQueueMetrics() {
    try {
        if (!channel) {
            return;
        }
        
        // Get queue information for the upload queue
        const uploadQueueInfo = await channel.checkQueue(queueUpload);
        metrics.rabbitmqQueueSizeGauge.set({ queue: queueUpload }, uploadQueueInfo.messageCount);
        
        // Get queue information for the download queue
        const downloadQueueInfo = await channel.checkQueue(queueDownload);
        metrics.rabbitmqQueueSizeGauge.set({ queue: queueDownload }, downloadQueueInfo.messageCount);
        
        // Log queue sizes if non-zero for monitoring
        if (uploadQueueInfo.messageCount > 0 || downloadQueueInfo.messageCount > 0) {
            console.log(`[RabbitMQ] Queue sizes - Upload: ${uploadQueueInfo.messageCount}, Download: ${downloadQueueInfo.messageCount}`);
        }
    } catch (error) {
        console.error('Error updating queue metrics:', error);
    }
}

// Send message to queue
async function sendToQueue(queue, message) {
    try {
        if (!channel) {
            await connect();
        }
        
        // Generate a message ID for deduplication
        const messageId = generateMessageId(message);
        
        // Send message as buffer with persistent flag and messageId
        const success = channel.sendToQueue(
            queue, 
            Buffer.from(JSON.stringify(message)), 
            { 
                persistent: true,
                messageId: messageId
            }
        );
        
        // Update queue metrics after sending
        updateQueueMetrics().catch(console.error);
        
        return success;
    } catch (error) {
        console.error(`Error sending message to queue ${queue}:`, error);
        // Try to reconnect and send again
        connection = null;
        channel = null;
        await connect();
        return channel.sendToQueue(
            queue, 
            Buffer.from(JSON.stringify(message)), 
            { 
                persistent: true,
                messageId: generateMessageId(message)
            }
        );
    }
}

// Consume messages from a queue
async function consumeQueue(queue, callback) {
    try {
        if (!channel) {
            await connect();
        }
        
        // Set prefetch to 1 to only handle one message at a time per consumer
        await channel.prefetch(1);
        
        // Use noAck: false to ensure messages aren't automatically acknowledged
        await channel.consume(queue, async (msg) => {
            if (msg !== null) {
                try {
                    console.log(`[RabbitMQ] Received message from ${queue}, processing...`);
                    const content = JSON.parse(msg.content.toString());
                    
                    // Pass the message and properties to the callback
                    await callback(content, msg.properties);
                    
                    // Explicitly acknowledge the message once processed
                    channel.ack(msg);
                    console.log(`[RabbitMQ] Successfully processed message from ${queue}`);
                } catch (error) {
                    console.error(`[RabbitMQ] Error processing message from queue ${queue}:`, error);
                    
                    // Negative acknowledgment - don't requeue if processing failed
                    // This prevents the message from continuously failing
                    channel.nack(msg, false, false);
                    console.log(`[RabbitMQ] Message nacked and will not be requeued`);
                }
            }
        }, { noAck: false });
        
        console.log(`[RabbitMQ] Consumer registered for queue: ${queue} with explicit acknowledgment`);
    } catch (error) {
        console.error(`[RabbitMQ] Error consuming from queue ${queue}:`, error);
        // Try to reconnect and consume again
        connection = null;
        channel = null;
        setTimeout(() => consumeQueue(queue, callback), 5000);
    }
}

// Close connection
async function closeConnection() {
    try {
        if (channel) await channel.close();
        if (connection) await connection.close();
        console.log('Closed RabbitMQ connection');
    } catch (error) {
        console.error('Error closing RabbitMQ connection:', error);
    }
}

// Export configuration and functions
module.exports = {
    connect,
    sendToQueue,
    consumeQueue,
    closeConnection,
    queues: {
        upload: queueUpload,
        download: queueDownload
    }
}; 