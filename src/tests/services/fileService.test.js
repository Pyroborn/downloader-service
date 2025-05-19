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
    DeleteObjectCommand: jest.fn(),
    HeadBucketCommand: jest.fn(),
    CreateBucketCommand: jest.fn()
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
        downloadBytesTotal: { inc: jest.fn() },
        uploadBytesTotal: { inc: jest.fn() },
        deleteRequestsTotal: { inc: jest.fn() },
        listRequestsTotal: { inc: jest.fn() },
        activeUploadsGauge: { inc: jest.fn(), dec: jest.fn() },
        activeDownloadsGauge: { inc: jest.fn(), dec: jest.fn() }
    }
}));

const { S3Client } = require('@aws-sdk/client-s3');
const fileService = require('../../services/fileService');

describe('FileService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('listFiles', () => {
        const mockUser = {
            userId: '123',
            id: '123',
            role: 'user'
        };

        const mockAdminUser = {
            userId: '456',
            id: '456',
            role: 'admin'
        };

        it('should list files successfully for admin user', async () => {
            const mockContents = [
                { Key: '123/file1.txt', Size: 100, LastModified: new Date() },
                { Key: '456/file2.txt', Size: 200, LastModified: new Date() }
            ];

            const mockS3Response = {
                Contents: mockContents
            };

            mockSend.mockResolvedValueOnce(mockS3Response);

            const result = await fileService.listFiles(mockAdminUser);

            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('key', '123/file1.txt');
            expect(result[0]).toHaveProperty('size', 100);
            expect(result[0]).toHaveProperty('lastModified');
        });

        it('should filter files for non-admin user', async () => {
            const mockContents = [
                { Key: '123/file1.txt', Size: 100, LastModified: new Date() },
                { Key: '456/file2.txt', Size: 200, LastModified: new Date() }
            ];

            const mockS3Response = {
                Contents: mockContents
            };

            mockSend.mockResolvedValueOnce(mockS3Response);

            const result = await fileService.listFiles(mockUser);

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('key', '123/file1.txt');
        });

        it('should handle empty response', async () => {
            mockSend.mockResolvedValueOnce({});
            const result = await fileService.listFiles(mockUser);
            expect(result).toEqual([]);
        });

        it('should return empty array when user has no files', async () => {
            const mockContents = [
                { Key: '456/file2.txt', Size: 200, LastModified: new Date() }
            ];

            const mockS3Response = {
                Contents: mockContents
            };

            mockSend.mockResolvedValueOnce(mockS3Response);

            const result = await fileService.listFiles(mockUser);
            expect(result).toEqual([]);
        });
    });

    describe('uploadFile', () => {
        const mockFile = {
            originalname: 'test.txt',
            buffer: Buffer.from('test content'),
            mimetype: 'text/plain'
        };

        const mockUser = {
            id: '123',
            userId: '123',
            name: 'Test User',
            email: 'test@example.com'
        };

        it('should upload file successfully with user metadata', async () => {
            const result = await fileService.uploadFile(mockFile, mockUser);

            expect(result).toHaveProperty('key');
            expect(result.key).toMatch(/^123\/\d+-test\.txt$/);  // Check that key follows the pattern with userId prefix
            expect(result).toHaveProperty('location');
            expect(result).toHaveProperty('mimetype', 'text/plain');
            expect(result).toHaveProperty('metadata');
            expect(result.metadata).toHaveProperty('userId', '123');
            expect(result.metadata).toHaveProperty('userName', 'Test User');
        });

        it('should handle upload errors', async () => {
            const { Upload } = require('@aws-sdk/lib-storage');
            Upload.mockImplementationOnce(() => ({
                done: jest.fn().mockRejectedValueOnce(new Error('Upload failed'))
            }));

            await expect(fileService.uploadFile(mockFile, mockUser)).rejects.toThrow('Failed to upload file');
        });
    });

    describe('downloadFile', () => {
        const mockUser = {
            userId: '123',
            id: '123',
            role: 'user'
        };

        const mockAdminUser = {
            userId: '456',
            id: '456',
            role: 'admin'
        };

        it('should download file successfully for owner', async () => {
            const mockStream = Buffer.from('test content');
            const mockResponse = {
                Body: mockStream,
                ContentLength: '100',
                ContentType: 'text/plain'
            };

            mockSend.mockResolvedValueOnce(mockResponse);

            const result = await fileService.downloadFile('123/test-key', mockUser);

            expect(result).toEqual(mockResponse);
        });

        it('should download any file for admin user', async () => {
            const mockStream = Buffer.from('test content');
            const mockResponse = {
                Body: mockStream,
                ContentLength: '100',
                ContentType: 'text/plain'
            };

            mockSend.mockResolvedValueOnce(mockResponse);

            const result = await fileService.downloadFile('123/test-key', mockAdminUser);

            expect(result).toEqual(mockResponse);
        });

        it('should reject access for non-owner user', async () => {
            await expect(fileService.downloadFile('789/test-key', mockUser)).rejects.toThrow('Access denied');
        });

        it('should handle download errors', async () => {
            mockSend.mockRejectedValueOnce(new Error('Download failed'));
            await expect(fileService.downloadFile('123/test-key', mockUser)).rejects.toThrow('Failed to download file');
        });
    });

    describe('deleteFile', () => {
        const mockUser = {
            userId: '123',
            id: '123',
            role: 'user'
        };

        const mockAdminUser = {
            userId: '456',
            id: '456',
            role: 'admin'
        };

        it('should delete file successfully for owner', async () => {
            mockSend.mockResolvedValueOnce({});
            const result = await fileService.deleteFile('123/test-key', mockUser);
            expect(result).toBe(true);
        });

        it('should delete any file for admin user', async () => {
            mockSend.mockResolvedValueOnce({});
            const result = await fileService.deleteFile('123/test-key', mockAdminUser);
            expect(result).toBe(true);
        });

        it('should reject access for non-owner user', async () => {
            await expect(fileService.deleteFile('789/test-key', mockUser)).rejects.toThrow('Access denied');
        });

        it('should handle delete errors', async () => {
            mockSend.mockRejectedValueOnce(new Error('Delete failed'));
            await expect(fileService.deleteFile('123/test-key', mockUser)).rejects.toThrow('Failed to delete file');
        });
    });
}); 