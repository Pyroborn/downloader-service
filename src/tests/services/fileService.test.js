// Create a mock send function that we can control
const mockSend = jest.fn();

// Mock the S3 client and commands first
jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({
        send: mockSend
    })),
    ListObjectsV2Command: jest.fn(),
    GetObjectCommand: jest.fn(),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn()
}));

// Mock the Upload class
jest.mock('@aws-sdk/lib-storage', () => ({
    Upload: jest.fn().mockImplementation(() => ({
        done: jest.fn().mockResolvedValue({ Key: 'test-file-key' })
    }))
}));

// Mock the Prometheus metrics module
jest.mock('../../config/metrics', () => ({
    metrics: {
        uploadRequestsTotal: { inc: jest.fn() },
        downloadRequestsTotal: { inc: jest.fn() },
        deleteRequestsTotal: { inc: jest.fn() },
        listRequestsTotal: { inc: jest.fn() },
        uploadBytesTotal: { inc: jest.fn() },
        downloadBytesTotal: { inc: jest.fn() }
    }
}));

const { S3Client } = require('@aws-sdk/client-s3');
const fileService = require('../../services/fileService');

describe('FileService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('listFiles', () => {
        it('should list files successfully', async () => {
            const mockContents = [
                { Key: 'file1.txt', Size: 100, LastModified: new Date() },
                { Key: 'file2.txt', Size: 200, LastModified: new Date() }
            ];

            const mockS3Response = {
                Contents: mockContents
            };

            mockSend.mockResolvedValueOnce(mockS3Response);

            const result = await fileService.listFiles();

            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('key', 'file1.txt');
            expect(result[0]).toHaveProperty('size', 100);
            expect(result[0]).toHaveProperty('lastModified');
        });

        it('should handle empty response', async () => {
            mockSend.mockResolvedValueOnce({});
            const result = await fileService.listFiles();
            expect(result).toEqual([]);
        });

        it('should handle errors', async () => {
            mockSend.mockRejectedValueOnce(new Error('S3 Error'));
            await expect(fileService.listFiles()).rejects.toThrow('Failed to list files');
        });
    });

    describe('uploadFile', () => {
        const mockFile = {
            originalname: 'test.txt',
            buffer: Buffer.from('test content'),
            mimetype: 'text/plain'
        };

        it('should upload file successfully', async () => {
            const result = await fileService.uploadFile(mockFile);

            expect(result).toHaveProperty('key');
            expect(result.key).toMatch(/^\d+-test\.txt$/);  // Check that key follows the pattern
            expect(result).toHaveProperty('location');
            expect(result).toHaveProperty('mimetype', 'text/plain');
        });

        it('should handle upload errors', async () => {
            const { Upload } = require('@aws-sdk/lib-storage');
            Upload.mockImplementationOnce(() => ({
                done: jest.fn().mockRejectedValueOnce(new Error('Upload failed'))
            }));

            await expect(fileService.uploadFile(mockFile)).rejects.toThrow('Failed to upload file');
        });
    });

    describe('downloadFile', () => {
        it('should download file successfully', async () => {
            const mockStream = Buffer.from('test content');
            const mockResponse = {
                Body: mockStream,
                ContentLength: '100',
                ContentType: 'text/plain'
            };

            mockSend.mockResolvedValueOnce(mockResponse);

            const result = await fileService.downloadFile('test-key');

            expect(result).toEqual(mockResponse);
        });

        it('should handle download errors', async () => {
            mockSend.mockRejectedValueOnce(new Error('Download failed'));
            await expect(fileService.downloadFile('test-key')).rejects.toThrow('Failed to download file');
        });
    });

    describe('deleteFile', () => {
        it('should delete file successfully', async () => {
            mockSend.mockResolvedValueOnce({});
            const result = await fileService.deleteFile('test-key');
            expect(result).toBe(true);
        });

        it('should handle delete errors', async () => {
            mockSend.mockRejectedValueOnce(new Error('Delete failed'));
            await expect(fileService.deleteFile('test-key')).rejects.toThrow('Failed to delete file');
        });
    });
}); 