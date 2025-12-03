/**
 * Preview Extractor Module
 * Extracts embedded JPEG previews from RAW files for fast analysis
 */
import sharp from 'sharp';
import { exiftool } from 'exiftool-vendored';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const TEMP_DIR = path.join(os.tmpdir(), 'raw-classifier-previews');

/**
 * Ensure temp directory exists
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

/**
 * Extract the largest embedded preview from a RAW file
 * @param {string} filePath - Path to RAW file
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Preview buffer and metadata
 */
export async function extractPreview(filePath, options = {}) {
  const {
    maxSize = 1920,       // Max dimension for analysis
    quality = 90,         // JPEG quality if re-encoding
    forceExtract = false, // Force extraction even if file is already JPEG
  } = options;

  await ensureTempDir();

  const ext = path.extname(filePath).toLowerCase();
  const isRaw = ['.nef', '.cr2', '.cr3', '.arw', '.orf', '.rw2', '.raf', '.dng', '.raw', '.pef', '.srw'].includes(ext);

  // If it's already a JPEG/PNG, just load and resize
  if (!isRaw && !forceExtract) {
    return await loadAndProcessImage(filePath, maxSize);
  }

  // For RAW files, extract embedded preview
  try {
    const previewPath = await extractEmbeddedPreview(filePath);
    if (previewPath) {
      const result = await loadAndProcessImage(previewPath, maxSize);
      // Clean up temp file
      await fs.unlink(previewPath).catch(() => {});
      return result;
    }
  } catch (error) {
    console.error(`Failed to extract preview from ${filePath}:`, error.message);
  }

  // Fallback: try to decode RAW directly with sharp (limited support)
  try {
    return await loadAndProcessImage(filePath, maxSize);
  } catch {
    return {
      buffer: null,
      width: 0,
      height: 0,
      error: 'Failed to extract preview',
    };
  }
}

/**
 * Extract embedded JPEG preview using exiftool
 */
async function extractEmbeddedPreview(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const previewPath = path.join(TEMP_DIR, `${baseName}_${Date.now()}.jpg`);

  try {
    // ExifTool can extract the largest preview
    await exiftool.extractJpgFromRaw(filePath, previewPath);

    // Verify the file was created
    await fs.access(previewPath);
    return previewPath;
  } catch (error) {
    // Try alternative preview tags
    try {
      await exiftool.extractPreview(filePath, previewPath);
      await fs.access(previewPath);
      return previewPath;
    } catch {
      return null;
    }
  }
}

/**
 * Load and process image with sharp
 */
async function loadAndProcessImage(filePath, maxSize) {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();

    // Calculate resize dimensions
    let width = metadata.width;
    let height = metadata.height;

    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.round((height / width) * maxSize);
        width = maxSize;
      } else {
        width = Math.round((width / height) * maxSize);
        height = maxSize;
      }
    }

    // Process image
    const buffer = await image
      .resize(width, height, { fit: 'inside' })
      .jpeg({ quality: 90 })
      .toBuffer();

    return {
      buffer,
      width,
      height,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
    };
  } catch (error) {
    return {
      buffer: null,
      width: 0,
      height: 0,
      error: error.message,
    };
  }
}

/**
 * Extract thumbnail for display purposes
 */
export async function extractThumbnail(filePath, size = 300) {
  const preview = await extractPreview(filePath, { maxSize: size });
  return preview;
}

/**
 * Get image buffer ready for TensorFlow analysis
 * @param {string} filePath - Path to image
 * @param {number} targetSize - Target size for ML model
 * @returns {Promise<Object>} Image data for TensorFlow
 */
export async function getImageForML(filePath, targetSize = 640) {
  const preview = await extractPreview(filePath, { maxSize: targetSize });

  if (!preview.buffer) {
    return { tensor: null, error: preview.error };
  }

  try {
    // Get raw pixel data for TensorFlow
    const { data, info } = await sharp(preview.buffer)
      .resize(targetSize, targetSize, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: preview.buffer,
      pixelData: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
      originalWidth: preview.originalWidth,
      originalHeight: preview.originalHeight,
    };
  } catch (error) {
    return { tensor: null, error: error.message };
  }
}

/**
 * Batch extract previews
 */
export async function extractPreviewBatch(filePaths, options = {}) {
  const results = await Promise.all(
    filePaths.map(fp => extractPreview(fp, options))
  );
  return results;
}

/**
 * Clean up temp directory
 */
export async function cleanupTempDir() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    await Promise.all(
      files.map(file => fs.unlink(path.join(TEMP_DIR, file)).catch(() => {}))
    );
  } catch {
    // Directory might not exist, ignore
  }
}

export default {
  extractPreview,
  extractThumbnail,
  getImageForML,
  extractPreviewBatch,
  cleanupTempDir,
};
