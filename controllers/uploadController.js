const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler'); 

const router = express.Router();
const upload = multer({ 
    storage: multer.memoryStorage(),
    // limits: { fileSize: 10 * 1024 * 1024 }, 
    // limits: { fileSize: 25 * 1024 * 1024 },
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    endpoint: process.env.AWS_ENDPOINT,
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 30000, // Increase connection timeout (30 seconds)
        socketTimeout: 300000,    // Increase socket timeout (5 minutes)
    }),
});

const wasabiClient = new S3Client({
    endpoint: process.env.WASABI_ENDPOINT,
    region: process.env.WASABI_REGION,
    credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
        secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
    },
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 30000, // Increase connection timeout (30 seconds)
        socketTimeout: 300000,    // Increase socket timeout (5 minutes)
    }),
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        console.log("file -> ", file);
        console.log(process.env.AWS_ACCESS_KEY_ID, process.env.AWS_SECRET_ACCESS_KEY);
        const userId = req.body.userId;
        const generateThumbnail = req.body.thumbnail === 'true'; // Check if thumbnail should be generated

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const ext = file.originalname.split('.').pop();
        const fileName = `${uuidv4()}.${ext}`;
        const rawFilePath = `uploads/${userId}/${fileName}`;

        // Upload raw image to AWS S3
        const rawUploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: rawFilePath,
            Body: file.buffer,
        };

        await s3Client.send(new PutObjectCommand(rawUploadParams));
        const rawUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${rawFilePath}`;

        // Process and upload compressed image to Wasabi
        const compressedBuffer = await sharp(file.buffer)
            .resize({ width: 500 })
            .toBuffer()
            .catch(err => {
                console.error('Sharp image processing error:', err);
                throw new Error('Image processing failed');
            });

        const compressedFilePath = `compressed/${userId}/${fileName}`;
        const compressedUploadParams = {
            Bucket: process.env.WASABI_BUCKET_NAME,
            Key: compressedFilePath,
            Body: compressedBuffer,
        };

        await wasabiClient.send(new PutObjectCommand(compressedUploadParams));
        const compressedUrl = `https://${process.env.WASABI_BUCKET_NAME}.s3.wasabisys.com/${compressedFilePath}`;

        let thumbnailUrl = null;
        if (generateThumbnail) {
            // Process and upload thumbnail image to Wasabi
            const thumbnailBuffer = await sharp(file.buffer)
                .resize({ width: 150 })
                .toBuffer()
                .catch(err => {
                    console.error('Sharp thumbnail image processing error:', err);
                    throw new Error('Image thumbnail processing failed');
                });

            const thumbnailFilePath = `thumbnails/${userId}/${fileName}`;
            const thumbnailUploadParams = {
                Bucket: process.env.WASABI_BUCKET_NAME,
                Key: thumbnailFilePath,
                Body: thumbnailBuffer,
            };

            await wasabiClient.send(new PutObjectCommand(thumbnailUploadParams));
            thumbnailUrl = `https://${process.env.WASABI_BUCKET_NAME}.s3.wasabisys.com/${thumbnailFilePath}`;
        }

        res.json({
            rawUrl,
            compressedUrl,
            ...(generateThumbnail && { thumbnailUrl }), // Include thumbnailUrl only if generated
        });
    } catch (error) {
        console.error('Error uploading file:', error.message); // Log the error message
        console.error(error.stack); // Log the stack trace for debugging
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

module.exports = router;