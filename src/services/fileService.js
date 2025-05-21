const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const s3Client = require('../config/s3Client');
const { metrics } = require('../config/metrics');

class FileService {
    constructor() {
        this.bucket = process.env.MINIO_BUCKET;
        // Initialize bucket on service startup
        this.initBucket().catch(err => {
            console.error('Failed to initialize bucket:', err);
        });
    }

    // Check if bucket exists and create it if it doesn't
    async initBucket() {
        try {
            // Try to check if bucket exists
            const headBucketCommand = new HeadBucketCommand({
                Bucket: this.bucket
            });
            
            try {
                await s3Client.send(headBucketCommand);
                console.log(`Bucket '${this.bucket}' already exists.`);
            } catch (error) {
                // If bucket doesn't exist, create it
                if (error.name === 'NotFound' || error.name === 'NoSuchBucket' || error.$metadata?.httpStatusCode === 404) {
                    console.log(`Bucket '${this.bucket}' does not exist. Creating it now...`);
                    const createBucketCommand = new CreateBucketCommand({
                        Bucket: this.bucket
                    });
                    await s3Client.send(createBucketCommand);
                    console.log(`Successfully created bucket '${this.bucket}'.`);
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Error initializing bucket:', error);
            throw error;
        }
    }

    async listFiles(user) {
        try {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket
            });

            try {
                const response = await s3Client.send(command);
                const files = response.Contents?.map(item => ({
                    key: item.Key,
                    size: item.Size,
                    lastModified: item.LastModified
                })) || [];

                // If user is not admin, filter files to show only their own
                if (user && user.role !== 'admin') {
                    // Use userId property consistently (not id)
                    const userId = user.userId || user.id;
                    
                    if (!userId) {
                        console.warn('User ID missing in filter, returning empty list for security');
                        return [];
                    }
                    
                    const filteredFiles = files.filter(file => file.key.startsWith(`${userId}/`));
                    // Reduced logging
                    if (filteredFiles.length === 0 && files.length > 0) {
                        console.log(`No files found for user ID ${userId} out of ${files.length} total files`);
                    }
                    return filteredFiles;
                }

                return files;
            } catch (bucketError) {
                console.error('Error listing files from bucket:', bucketError);
                // Return empty array if bucket doesn't exist or other errors
                return [];
            }
        } catch (error) {
            console.error('Error in listFiles function:', error);
            // Return empty array instead of throwing error
            return [];
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

    async uploadFile(file, user) {
        // Increment the active uploads gauge before starting
        metrics.activeUploadsGauge.inc();
        
        try {
            // Prefix the key with user ID for organization and access control
            const key = `${user.id}/${Date.now()}-${file.originalname}`;
            
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    Metadata: {
                        'user-id': user.id.toString(),
                        'user-name': user.name || '',
                        'user-email': user.email || '',
                        'original-name': file.originalname
                    }
                }
            });

            const result = await upload.done();

            metrics.uploadRequestsTotal.inc({ status: 'success', userId: user.id });
            metrics.uploadBytesTotal.inc({ status: 'success', userId: user.id }, file.buffer.length);

            return {
                key,
                location: `${process.env.MINIO_ENDPOINT}/${this.bucket}/${key}`,
                mimetype: file.mimetype,
                metadata: {
                    userId: user.id,
                    userName: user.name || '',
                    originalName: file.originalname
                }
            };
        } catch (error) {
            metrics.uploadRequestsTotal.inc({ status: 'error', userId: user.id });
            console.error('Error uploading file:', error);
            throw new Error('Failed to upload file');
        } finally {
            // Always decrement the active uploads gauge when finished
            metrics.activeUploadsGauge.dec();
        }
    }    

    // Add a method to check file access
    async checkFileAccess(key, userId, role) {
        try {
            // Admin has access to all files
            if (role === 'admin') {
                return true;
            }
            
            // Regular users can only access their own files (which start with their userId)
            if (key.startsWith(`${userId}/`)) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking file access:', error);
            return false;
        }
    }

    async downloadFile(key, user) {
        // Increment the active downloads gauge before starting
        metrics.activeDownloadsGauge.inc();
        
        try {
            // Check if user has access to this file
            const canAccess = await this.checkFileAccess(key, user.userId, user.role);
            if (!canAccess) {
                throw new Error('Access denied');
            }

            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const response = await s3Client.send(command);
            
            // Track metrics if user is provided
            if (user && user.userId) {
                metrics.downloadRequestsTotal.inc({ status: 'success', userId: user.userId });
                
                const contentLength = parseInt(response.ContentLength, 10);
                if (!isNaN(contentLength)) {
                    metrics.downloadBytesTotal.inc({ status: 'success', userId: user.userId }, contentLength);
                }
            }

            return response;
        } catch (error) {
            // Track metrics if user is provided
            if (user && user.userId) {
                metrics.downloadRequestsTotal.inc({ status: 'error', userId: user.userId });
            }
            
            console.error('Error downloading file:', error);
            if (error.message === 'Access denied') {
                throw error;
            }
            throw new Error('Failed to download file');
        } finally {
            // Always decrement the active downloads gauge when finished
            metrics.activeDownloadsGauge.dec();
        }
    }

    async deleteFile(key, user) {
        try {
            // Check if user has access to delete this file
            const canDelete = await this.checkFileAccess(key, user.userId, user.role);
            if (!canDelete) {
                throw new Error('Access denied');
            }

            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await s3Client.send(command);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            if (error.message === 'Access denied') {
                throw error;
            }
            throw new Error('Failed to delete file');
        }
    }
}

module.exports = new FileService(); 