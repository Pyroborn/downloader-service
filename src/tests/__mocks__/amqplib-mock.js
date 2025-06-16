// RabbitMQ channel mock
const mockChannel = {
  assertQueue: jest.fn().mockResolvedValue({ queue: 'mock-queue', messageCount: 0 }),
  sendToQueue: jest.fn().mockResolvedValue(true),
  consume: jest.fn((queue, callback) => {
    // Store callback for test-triggered consumption
    mockChannel.consumeCallback = callback;
    return { consumerTag: 'mock-consumer' };
  }),
  checkQueue: jest.fn().mockResolvedValue({ messageCount: 0 }),
  ack: jest.fn().mockImplementation((msg) => true),
  prefetch: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined)
};

// RabbitMQ connection mock
const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined)
};

// Connect function mock
const connect = jest.fn().mockResolvedValue(mockConnection);

module.exports = {
  connect,
  mockConnection,
  mockChannel
}; 