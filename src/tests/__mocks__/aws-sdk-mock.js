// S3 client and commands mock
const mockSend = jest.fn();

// S3 client mock
const S3Client = jest.fn(() => ({
  send: mockSend
}));

// Command mocks
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
  mockSend // Exported for test access
}; 