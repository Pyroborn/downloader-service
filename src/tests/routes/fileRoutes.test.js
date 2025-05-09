const request = require('supertest');
const express = require('express');
const multer = require('multer');
const fileService = require('../../services/fileService');

// Mock file service
jest.mock('../../services/fileService');

// Mock the Prometheus metrics module
jest.mock('../../config/metrics', () => ({
    metrics: {
        uploadRequestsTotal: { inc: jest.fn() },
        downloadRequestsTotal: { inc: jest.fn() },
        uploadBytesTotal: { inc: jest.fn() },
        downloadBytesTotal: { inc: jest.fn() }
    }
}));

// Create express app for testing
const app = express();
app.use(express.json());
app.use('/files', require('../../routes/fileRoutes'));

describe('File Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /files/list', () => {
        it('should return list of files', async () => {
            const mockFiles = [
                { key: 'file1.txt', size: 100, lastModified: new Date().toISOString() },
                { key: 'file2.txt', size: 200, lastModified: new Date().toISOString() }
            ];

            fileService.listFiles.mockResolvedValueOnce(mockFiles);

            const response = await request(app)
                .get('/files/list')
                .expect(200);

            expect(response.body).toEqual(mockFiles);
            expect(fileService.listFiles).toHaveBeenCalled();
        });

        it('should handle errors', async () => {
            fileService.listFiles.mockRejectedValueOnce(new Error('Failed to list files'));

            await request(app)
                .get('/files/list')
                .expect(500);
        });
    });

    describe('GET /files/download/:key', () => {
        it('should download file successfully', async () => {
            const mockContent = Buffer.from('test content');
            const mockResponse = {
                Body: {
                    pipe: jest.fn((res) => {
                        res.write(mockContent);
                        res.end();
                    })
                },
                ContentType: 'text/plain',
                ContentLength: '12'
            };

            fileService.downloadFile.mockResolvedValueOnce(mockResponse);

            await request(app)
                .get('/files/download/test.txt')
                .expect(200)
                .expect('Content-Type', 'text/plain')
                .expect('Content-Length', '12')
                .expect(mockContent.toString());

            expect(fileService.downloadFile).toHaveBeenCalledWith('test.txt');
        });

        it('should handle download errors', async () => {
            fileService.downloadFile.mockRejectedValueOnce(new Error('Failed to download'));

            await request(app)
                .get('/files/download/test.txt')
                .expect(500);
        });
    });

    describe('POST /files/upload', () => {
        it('should upload file successfully', async () => {
            const mockResult = {
                key: 'test-file-key',
                location: 'http://minio/bucket/test-file-key',
                mimetype: 'text/plain'
            };

            fileService.uploadFile.mockResolvedValueOnce(mockResult);

            const response = await request(app)
                .post('/files/upload')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(201);

            expect(response.body).toEqual(mockResult);
            expect(fileService.uploadFile).toHaveBeenCalled();
        });

        it('should handle missing file', async () => {
            await request(app)
                .post('/files/upload')
                .expect(400);
        });

        it('should handle upload errors', async () => {
            fileService.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));

            await request(app)
                .post('/files/upload')
                .attach('file', Buffer.from('test content'), 'test.txt')
                .expect(500);
        });
    });

    describe('DELETE /files/:key', () => {
        it('should delete file successfully', async () => {
            fileService.deleteFile.mockResolvedValueOnce(true);

            await request(app)
                .delete('/files/test.txt')
                .expect(200);

            expect(fileService.deleteFile).toHaveBeenCalledWith('test.txt');
        });

        it('should handle delete errors', async () => {
            fileService.deleteFile.mockRejectedValueOnce(new Error('Delete failed'));

            await request(app)
                .delete('/files/test.txt')
                .expect(500);
        });
    });
}); 