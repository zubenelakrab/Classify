/**
 * Duplicate Detector Module
 * Detects duplicate files by hash, name pattern, or EXIF data
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { extractExif } from '../analyzers/exifParser.js';

/**
 * Calculate file hash (first 64KB + last 64KB + file size for speed)
 */
async function calculateQuickHash(filePath) {
  const CHUNK_SIZE = 64 * 1024; // 64KB

  try {
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const handle = await fs.open(filePath, 'r');

    const hash = crypto.createHash('md5');

    // Add file size to hash
    hash.update(Buffer.from(fileSize.toString()));

    // Read first chunk
    const firstBuffer = Buffer.alloc(Math.min(CHUNK_SIZE, fileSize));
    await handle.read(firstBuffer, 0, firstBuffer.length, 0);
    hash.update(firstBuffer);

    // Read last chunk if file is larger
    if (fileSize > CHUNK_SIZE) {
      const lastBuffer = Buffer.alloc(CHUNK_SIZE);
      await handle.read(lastBuffer, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);
      hash.update(lastBuffer);
    }

    await handle.close();
    return hash.digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Calculate full file hash (slower but more accurate)
 */
async function calculateFullHash(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Extract original filename from classified filename
 * Pattern: 001_select_s74_r5.nef -> extracts sequence info
 */
function extractOriginalPattern(filename) {
  // Match pattern: NNN_category_sNN_rN.ext
  const classifiedMatch = filename.match(/^\d+_\w+_s\d+_r\d+\.(\w+)$/i);
  if (classifiedMatch) {
    return { isClassified: true, extension: classifiedMatch[1].toLowerCase() };
  }

  // Original filename
  return { isClassified: false, original: filename };
}

/**
 * Create EXIF signature for duplicate detection
 */
function createExifSignature(exif) {
  if (!exif) return null;

  const parts = [
    exif.camera?.make,
    exif.camera?.model,
    exif.camera?.serial,
    exif.timestamp?.taken?.toISOString?.() || exif.timestamp?.taken,
    exif.image?.width,
    exif.image?.height,
    exif.exposure?.iso,
    exif.exposure?.aperture,
    exif.exposure?.shutterSpeedValue,
    exif.lens?.focalLength,
  ].filter(Boolean);

  if (parts.length < 5) return null; // Not enough data

  return parts.join('|');
}

/**
 * Find duplicates in a list of files
 */
export async function findDuplicates(files, options = {}) {
  const {
    method = 'hybrid', // 'hash', 'exif', 'hybrid'
    quickHash = true,
    onProgress = null,
  } = options;

  const fileInfos = [];
  const duplicateGroups = new Map(); // signature -> [files]

  // Phase 1: Collect file info
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const filename = path.basename(filePath);

    try {
      const stats = await fs.stat(filePath);
      const info = {
        path: filePath,
        filename,
        size: stats.size,
        mtime: stats.mtime,
        hash: null,
        exifSignature: null,
      };

      // Calculate hash
      if (method === 'hash' || method === 'hybrid') {
        info.hash = quickHash
          ? await calculateQuickHash(filePath)
          : await calculateFullHash(filePath);
      }

      // Extract EXIF signature
      if (method === 'exif' || method === 'hybrid') {
        const exif = await extractExif(filePath);
        info.exifSignature = createExifSignature(exif);
        info.exif = exif;
      }

      fileInfos.push(info);

      if (onProgress) {
        onProgress(i + 1, files.length, filename);
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  // Phase 2: Group by signature
  for (const info of fileInfos) {
    let signature = null;

    if (method === 'hash') {
      signature = info.hash;
    } else if (method === 'exif') {
      signature = info.exifSignature;
    } else if (method === 'hybrid') {
      // Prefer EXIF (same photo even if reprocessed), fallback to hash
      signature = info.exifSignature || info.hash;
    }

    if (!signature) continue;

    // Also group by size for hash method (optimization)
    const key = method === 'hash' ? `${info.size}:${signature}` : signature;

    if (!duplicateGroups.has(key)) {
      duplicateGroups.set(key, []);
    }
    duplicateGroups.get(key).push(info);
  }

  // Phase 3: Filter to actual duplicates (groups with more than 1 file)
  const duplicates = [];
  let totalDuplicateFiles = 0;
  let totalWastedSpace = 0;

  for (const [signature, group] of duplicateGroups) {
    if (group.length > 1) {
      // Sort by mtime (oldest first = likely original)
      group.sort((a, b) => a.mtime - b.mtime);

      const original = group[0];
      const copies = group.slice(1);

      duplicates.push({
        signature,
        original,
        copies,
        count: group.length,
        wastedSpace: copies.reduce((sum, f) => sum + f.size, 0),
      });

      totalDuplicateFiles += copies.length;
      totalWastedSpace += copies.reduce((sum, f) => sum + f.size, 0);
    }
  }

  // Sort by wasted space (biggest first)
  duplicates.sort((a, b) => b.wastedSpace - a.wastedSpace);

  return {
    duplicates,
    stats: {
      totalFiles: files.length,
      uniqueFiles: files.length - totalDuplicateFiles,
      duplicateFiles: totalDuplicateFiles,
      duplicateGroups: duplicates.length,
      wastedSpace: totalWastedSpace,
      wastedSpaceFormatted: formatBytes(totalWastedSpace),
    },
  };
}

/**
 * Check if a file already exists in target directory
 */
export async function checkExistingDuplicates(sourceFiles, targetDir, options = {}) {
  const {
    recursive = true,
    method = 'hybrid',
  } = options;

  // Get existing files in target
  const existingFiles = await scanDirectory(targetDir, recursive);

  if (existingFiles.length === 0) {
    return {
      newFiles: sourceFiles,
      duplicates: [],
      existingCount: 0,
    };
  }

  // Build signature map for existing files
  const existingSignatures = new Map();

  for (const filePath of existingFiles) {
    const hash = await calculateQuickHash(filePath);
    const exif = await extractExif(filePath);
    const exifSig = createExifSignature(exif);

    if (hash) existingSignatures.set(hash, filePath);
    if (exifSig) existingSignatures.set(exifSig, filePath);
  }

  // Check source files against existing
  const newFiles = [];
  const duplicates = [];

  for (const sourcePath of sourceFiles) {
    const hash = await calculateQuickHash(sourcePath);
    const exif = await extractExif(sourcePath);
    const exifSig = createExifSignature(exif);

    const existingPath = existingSignatures.get(hash) || existingSignatures.get(exifSig);

    if (existingPath) {
      duplicates.push({
        source: sourcePath,
        existing: existingPath,
        method: existingSignatures.has(hash) ? 'hash' : 'exif',
      });
    } else {
      newFiles.push(sourcePath);
    }
  }

  return {
    newFiles,
    duplicates,
    existingCount: existingFiles.length,
  };
}

/**
 * Scan directory for files
 */
async function scanDirectory(dirPath, recursive = true) {
  const files = [];
  const supportedExtensions = [
    '.nef', '.cr2', '.cr3', '.arw', '.orf', '.rw2', '.raf', '.dng', '.raw', '.pef', '.srw',
    '.jpg', '.jpeg', '.png', '.tiff', '.tif',
  ];

  async function scan(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Remove duplicate files (keep originals)
 */
export async function removeDuplicates(duplicates, options = {}) {
  const { dryRun = true } = options;

  const results = {
    removed: [],
    failed: [],
    freedSpace: 0,
  };

  for (const group of duplicates) {
    for (const copy of group.copies) {
      try {
        if (!dryRun) {
          await fs.unlink(copy.path);
        }
        results.removed.push(copy.path);
        results.freedSpace += copy.size;
      } catch (error) {
        results.failed.push({ path: copy.path, error: error.message });
      }
    }
  }

  results.freedSpaceFormatted = formatBytes(results.freedSpace);
  return results;
}

export default {
  findDuplicates,
  checkExistingDuplicates,
  removeDuplicates,
  calculateQuickHash,
  formatBytes,
};
