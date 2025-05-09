const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const s3Client = require('../config/s3Client');
const { metrics } = require('../config/metrics');

class FileService {
    constructor() {
        this.bucket = process.env.MINIO_BUCKET;
    }

    async listFiles() {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket
            });

            const response = await s3Client.send(command);
            return response.Contents?.map(item => ({
                key: item.Key,
                size: item.Size,
                lastModified: item.LastModified
            })) || [];
        } catch (error) {
            console.error('Error listing files:', error);
            throw new Error('Failed to list files');
        }
    }

    //async uploadFile(file) { // old version
    //    try {
    //        const upload = new Upload({
    //            client: s3Client,
    //            params: {
    //                Bucket: this.bucket,
    //                Key: `${Date.now()}-${file.originalname}`,
    //                Body: file.buffer,
    //                ContentType: file.mimetype
    //            }
    //        });
//
    //           const result = await upload.done();
    //        return {
    //            key: result.Key,
    //            location: `${process.env.MINIO_ENDPOINT}/${this.bucket}/${result.Key}`,
    //            mimetype: file.mimetype
    //        };
    //    } catch (error) {
    //        console.error('Error uploading file:', error);
    //        throw new Error('Failed to upload file');
    //    }
    //}

    async uploadFile(file) {
        const key = `${Date.now()}-${file.originalname}`;
        try {
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype
                }
            });
    
            const result = await upload.done();
    
            // Increment upload request counter with success status
            metrics.uploadRequestsTotal.inc({ status: 'success' });
    
            // Increment uploaded bytes counter
            metrics.uploadBytesTotal.inc({ status: 'success' }, file.buffer.length);
    
            return {
                key,
                location: `${process.env.MINIO_ENDPOINT}/${this.bucket}/${key}`,
                mimetype: file.mimetype
            };
        } catch (error) {
            // Increment upload request counter with error status
            metrics.uploadRequestsTotal.inc({ status: 'error' });
    
            console.error('Error uploading file:', error);
            throw new Error('Failed to upload file');
        }
    }    

    async downloadFile(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const response = await s3Client.send(command);
            
            // Increment download request counter with success status
            metrics.downloadRequestsTotal.inc({ status: 'success' });
            
            // Get the content length and increment the bytes counter
            const contentLength = parseInt(response.ContentLength, 10);
            if (!isNaN(contentLength)) {
                metrics.downloadBytesTotal.inc({ status: 'success' }, contentLength);
            }

            return response;
        } catch (error) {
            // Increment download request counter with error status
            metrics.downloadRequestsTotal.inc({ status: 'error' });
            console.error('Error downloading file:', error);
            throw new Error('Failed to download file');
        }
    }

    async deleteFile(key) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await s3Client.send(command);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            throw new Error('Failed to delete file');
        }
    }
}

module.exports = new FileService(); 