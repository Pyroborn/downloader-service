const amqp = require('amqplib');
const { metrics } = require('./metrics'); 
const crypto = require('crypto');
require('dotenv').config();

// Configuration
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const queueUpload = process.env.RABBITMQ_QUEUE_UPLOAD || 'file_upload_queue';
const queueDownload = process.env.RABBITMQ_QUEUE_DOWNLOAD || 'file_download_queue';

// Connection variables
let connection = null;
let channel = null;

// Generate unique message ID for deduplication
function generateMessageId(message) {
    if (typeof message === 'object') {
        // Upload message hash
        if (message.file && message.metadata) {
            const { originalname, size } = message.file;
            const userId = message.metadata.id || message.metadata.userId;
            return crypto.createHash('md5')
                .update(`${userId}-${originalname}-${size}-${Date.now()}`)
                .digest('hex');
        }
        
        // Download message hash
        if (message.key && message.user) {
            const { key } = message;
            const userId = message.user.userId;
            return crypto.createHash('md5')
                .update(`${userId}-${key}-${Date.now()}`)
                .digest('hex');
        }
    }
    
    // Fallback random ID
    return `${crypto.randomBytes(8).toString('hex')}-${Date.now()}`;
}

// Connect to RabbitMQ
async function connect() {
    try {
        connection = await amqp.connect(rabbitmqUrl);
        channel = await connection.createChannel();
        
        await channel.assertQueue(queueUpload, { durable: true });
        await channel.assertQueue(queueDownload, { durable: true });
        
        console.log('Connected to RabbitMQ');
        
        setInterval(updateQueueMetrics, 5000);
        
        return { connection, channel };
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connect, 5000);
    }
}

// Update queue metrics for monitoring
async function updateQueueMetrics() {
    try {
        if (!channel) {
            return;
        }
        
        const uploadQueueInfo = await channel.checkQueue(queueUpload);
        metrics.rabbitmqQueueSizeGauge.set({ queue: queueUpload }, uploadQueueInfo.messageCount);
        
        const downloadQueueInfo = await channel.checkQueue(queueDownload);
        metrics.rabbitmqQueueSizeGauge.set({ queue: queueDownload }, downloadQueueInfo.messageCount);
        
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
        
        const messageId = generateMessageId(message);
        
        const success = channel.sendToQueue(
            queue, 
            Buffer.from(JSON.stringify(message)), 
            { 
                persistent: true,
                messageId: messageId
            }
        );
        
        updateQueueMetrics().catch(console.error);
        
        return success;
    } catch (error) {
        console.error(`Error sending message to queue ${queue}:`, error);
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

// Consume messages from queue
async function consumeQueue(queue, callback) {
    try {
        if (!channel) {
            await connect();
        }
        
        await channel.prefetch(1);
        
        await channel.consume(queue, async (msg) => {
            if (msg !== null) {
                try {
                    console.log(`[RabbitMQ] Received message from ${queue}, processing...`);
                    const content = JSON.parse(msg.content.toString());
                    
                    await callback(content, msg.properties);
                    
                    channel.ack(msg);
                    console.log(`[RabbitMQ] Successfully processed message from ${queue}`);
                } catch (error) {
                    console.error(`[RabbitMQ] Error processing message from queue ${queue}:`, error);
                    
                    channel.nack(msg, false, false);
                    console.log(`[RabbitMQ] Message nacked and will not be requeued`);
                }
            }
        }, { noAck: false });
        
        console.log(`[RabbitMQ] Consumer registered for queue: ${queue} with explicit acknowledgment`);
    } catch (error) {
        console.error(`[RabbitMQ] Error consuming from queue ${queue}:`, error);
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