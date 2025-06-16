const request = require('supertest');
const express = require('express');
const fileService = require('../../services/fileService');
const jwt = require('jsonwebtoken');

// Service mocks
jest.mock('../../services/fileService', () => ({
  listFiles: jest.fn(),
  downloadFile: jest.fn(),
  deleteFile: jest.fn(),
  checkFileAccess: jest.fn(),
  uploadFile: jest.fn()
}));

jest.mock('../../config/metrics', () => ({
  metrics: {
    uploadRequestsTotal: { inc: jest.fn() },
    downloadRequestsTotal: { inc: jest.fn() },
    uploadBytesTotal: { inc: jest.fn() },
    downloadBytesTotal: { inc: jest.fn() },
    deleteRequestsTotal: { inc: jest.fn() },
    listRequestsTotal: { inc: jest.fn() },
    activeUploadsGauge: { inc: jest.fn(), dec: jest.fn() },
    activeDownloadsGauge: { inc: jest.fn(), dec: jest.fn() }
  }
}));

jest.mock('../../config/rabbitmq', () => ({
  sendToQueue: jest.fn().mockResolvedValue(true),
  getChannel: jest.fn().mockResolvedValue({
    sendToQueue: jest.fn().mockReturnValue(true),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' })
  }),
  queues: {
    upload: 'file_upload_queue',
    download: 'file_download_queue'
  }
}));

// JWT module mock
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockImplementation((token, secret) => {
    if (token === 'admin-token') {
      return {
        userId: '456',
        id: '456',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin'
      };
    }
    return {
      userId: '123',
      id: '123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user'
    };
  }),
  decode: jest.fn()
}));

// Multer mock
jest.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req, res, next) => {
      req.file = {
        originalname: 'test.txt',
        buffer: Buffer.from('test content'),
        mimetype: 'text/plain',
        size: 12
      };
      next();
    }
  });
  multerMock.memoryStorage = () => ({});
  return multerMock;
});

// Express app setup
const app = express();
app.use(express.json());

// Auth middleware mock
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  try {
    if (token === 'admin-token') {
      req.user = {
        id: '456',
        userId: '456',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin'
      };
    } else {
      req.user = {
        id: '123',
        userId: '123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      };
    }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

// Import routes
const fileRoutes = require('../../routes/fileRoutes');
app.use('/files', fileRoutes);

describe('File Routes', () => {
  const mockAdminToken = 'admin-token';
  const mockUserToken = 'user-token';

  beforeEach(() => {
    jest.clearAllMocks();
    fileService.checkFileAccess.mockResolvedValue(true);
  });

  describe('GET /files/list', () => {
    it('should return list of files for regular user', async () => {
      const mockFiles = [
        { key: '123/file1.txt', size: 100, lastModified: new Date().toISOString() },
        { key: '123/file2.txt', size: 200, lastModified: new Date().toISOString() }
      ];

      fileService.listFiles.mockResolvedValueOnce(mockFiles);

      const response = await request(app)
        .get('/files/list')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(200);

      expect(response.body).toEqual(mockFiles);
    });

    it('should return all files for admin user', async () => {
      const mockFiles = [
        { key: '123/file1.txt', size: 100, lastModified: new Date().toISOString() },
        { key: '456/file2.txt', size: 200, lastModified: new Date().toISOString() }
      ];

      fileService.listFiles.mockResolvedValueOnce(mockFiles);

      const response = await request(app)
        .get('/files/list')
        .set('Authorization', 'Bearer ' + mockAdminToken)
        .expect(200);

      expect(response.body).toEqual(mockFiles);
    });

    it('should handle errors', async () => {
      fileService.listFiles.mockRejectedValueOnce(new Error('Failed to list files'));

      await request(app)
        .get('/files/list')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(500);
    });
  });

  describe('GET /files/download/:key', () => {
    it('should download file successfully for owner', async () => {
      // Creating a more robust mock for the Body stream
      const mockStream = {
        pipe: jest.fn(function(destination) {
          // Simulating successful piping to response by ending it
          if (destination && typeof destination.end === 'function') {
            process.nextTick(() => destination.end('test content'));
          }
          return destination;
        }),
        on: jest.fn(function(event, callback) {
          // Immediately triggering end event to simulate completion
          if (event === 'end' && callback) {
            process.nextTick(callback);
          }
          return this;
        })
      };
      
      fileService.downloadFile.mockResolvedValueOnce({
        Body: mockStream,
        ContentType: 'text/plain',
        ContentLength: 12
      });

      await request(app)
        .get('/files/download/123/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(200);
    });

    it('should handle access denied errors', async () => {
      // Mocking checkFileAccess to deny access
      fileService.checkFileAccess.mockResolvedValueOnce(false);

      await request(app)
        .get('/files/download/456/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(403);
    });

    it('should handle download errors', async () => {
      fileService.downloadFile.mockRejectedValueOnce(new Error('Failed to download'));
      
      await request(app)
        .get('/files/download/123/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(500);
    });
  });

  describe('POST /files/upload', () => {
    it('should accept upload request', async () => {
      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .attach('file', Buffer.from('test file content'), 'test.txt')
        .expect(202);

      expect(response.body.message).toContain('File upload queued');
    });
  });

  describe('DELETE /files/:key', () => {
    it('should delete file successfully for owner', async () => {
      fileService.deleteFile.mockResolvedValueOnce(true);

      await request(app)
        .delete('/files/123/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(200);
    });

    it('should handle access denied errors', async () => {
      // Mocking checkFileAccess to deny access
      fileService.checkFileAccess.mockResolvedValueOnce(false);

      await request(app)
        .delete('/files/456/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(403);
    });

    it('should handle delete errors', async () => {
      fileService.deleteFile.mockRejectedValueOnce(new Error('Delete failed'));

      await request(app)
        .delete('/files/123/test.txt')
        .set('Authorization', 'Bearer ' + mockUserToken)
        .expect(500);
    });
  });
}); 