/**
 * Storage Utility
 * Handles file storage via Supabase Storage.
 * Falls back to local disk if NEXT_PUBLIC_SUPABASE_URL is not set.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'creations');
const BUCKET = 'creations';

/**
 * Ensure the local upload directory exists (fallback for dev without Supabase)
 * @returns {string} Upload directory path
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  return UPLOAD_DIR;
}

/**
 * Upload a file to Supabase Storage
 * @param {Object} file - multer file object (buffer-based via memoryStorage)
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadFile(file) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Fallback: save to local disk
    ensureUploadDir();
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `${Date.now()}-${uniqueId}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, file.buffer);
    return getFileUrl(filename);
  }

  const { supabaseAdmin } = require('./supabase-admin');
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const storagePath = `${Date.now()}-${uniqueId}${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return getPublicUrl(storagePath);
}

/**
 * Get the public URL for a file
 * @param {string} filename - The filename or storage path
 * @returns {string} Public URL
 */
function getFileUrl(filename) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return getPublicUrl(filename);
  }
  if (process.env.STORAGE_BASE_URL) {
    return `${process.env.STORAGE_BASE_URL}/creations/${filename}`;
  }
  return `/uploads/creations/${filename}`;
}

/**
 * Get Supabase Storage public URL
 * @param {string} storagePath
 * @returns {string}
 */
function getPublicUrl(storagePath) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/**
 * Delete a file from storage
 * @param {string} filename
 */
async function deleteFile(filename) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = require('./supabase-admin');
    await supabaseAdmin.storage.from(BUCKET).remove([filename]);
    return;
  }

  // Local fallback
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Upload a raw buffer to storage (for skill-generated files)
 * @param {Buffer} buffer - File content
 * @param {string} ext - File extension (e.g., '.mp3', '.png')
 * @param {string} [mimetype] - MIME type
 * @returns {Promise<string>} Public URL
 */
async function uploadBuffer(buffer, ext, mimetype) {
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const filename = `agent-${Date.now()}-${uniqueId}${ext}`;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    ensureUploadDir();
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return getFileUrl(filename);
  }

  const { supabaseAdmin } = require('./supabase-admin');
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimetype || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return getPublicUrl(filename);
}

module.exports = {
  ensureUploadDir,
  uploadFile,
  uploadBuffer,
  getFileUrl,
  getPublicUrl,
  deleteFile,
  UPLOAD_DIR,
};
