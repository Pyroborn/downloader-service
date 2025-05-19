// Mock S3 client and commands
const mockSend = jest.fn();

// Create mock S3 client that returns the mockSend function
const S3Client = jest.fn(() => ({
  send: mockSend
}));

// Mock commands
const ListObjectsV2Command = jest.fn();
const GetObjectCommand = jest.fn();
const PutObjectCommand = jest.fn();
const DeleteObjectCommand = jest.fn();
const HeadBucketCommand = jest.fn();
const CreateBucketCommand = jest.fn();

module.exports = {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  mockSend // Export for test access
}; 