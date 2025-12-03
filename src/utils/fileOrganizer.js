/**
 * File Organizer Module
 * Handles file renaming, moving, and organization
 */
import { promises as fs } from 'fs';
import path from 'path';
import config from '../../config/default.js';

/**
 * Generate new filename based on analysis results
 * @param {Object} analysis - Image analysis results
 * @param {number} sequence - Sequence number
 * @param {Object} options - Naming options
 * @returns {string} New filename
 */
export function generateFilename(analysis, sequence, options = {}) {
  const {
    includeScore = true,
    includeCategory = true,
    preserveExtension = true,
    sequenceDigits = 3,
    separator = '_',
  } = options;

  const parts = [];

  // Sequence number
  parts.push(String(sequence).padStart(sequenceDigits, '0'));

  // Category prefix
  if (includeCategory && analysis.scoring?.classification?.category) {
    parts.push(analysis.scoring.classification.category);
  }

  // Score
  if (includeScore && analysis.scoring?.overall !== undefined) {
    parts.push(`s${analysis.scoring.overall}`);
  }

  // Rating stars
  if (analysis.scoring?.rating) {
    parts.push(`r${analysis.scoring.rating}`);
  }

  // Build filename
  let newName = parts.join(separator);

  // Preserve original extension
  if (preserveExtension) {
    const ext = path.extname(analysis.file?.name || analysis.file?.path || '');
    newName += ext.toLowerCase();
  }

  return newName;
}

/**
 * Create organized directory structure
 * @param {string} baseDir - Base output directory
 * @param {Object} options - Organization options
 * @returns {Promise<Object>} Created directory paths
 */
export async function createDirectoryStructure(baseDir, options = {}) {
  const {
    createCategories = true,
    createBurstFolders = false,
    createSessionFolders = false,
  } = options;

  const dirs = {
    base: baseDir,
    categories: {},
  };

  // Create base directory
  await fs.mkdir(baseDir, { recursive: true });

  // Create category subdirectories
  if (createCategories) {
    for (const [key, folder] of Object.entries(config.folders)) {
      const dirPath = path.join(baseDir, folder);
      await fs.mkdir(dirPath, { recursive: true });
      dirs.categories[key] = dirPath;
    }
  }

  return dirs;
}

/**
 * Move/copy file to organized location
 * @param {string} sourcePath - Source file path
 * @param {string} destDir - Destination directory
 * @param {string} newFilename - New filename
 * @param {Object} options - Move options
 * @returns {Promise<Object>} Move result
 */
export async function moveFile(sourcePath, destDir, newFilename, options = {}) {
  const {
    copy = false,     // Copy instead of move
    overwrite = false,
    dryRun = false,
  } = options;

  const destPath = path.join(destDir, newFilename);

  // Check if destination exists
  try {
    await fs.access(destPath);
    if (!overwrite) {
      // Generate unique name
      const ext = path.extname(newFilename);
      const base = path.basename(newFilename, ext);
      let counter = 1;
      let uniquePath = destPath;

      while (true) {
        try {
          await fs.access(uniquePath);
          uniquePath = path.join(destDir, `${base}_${counter}${ext}`);
          counter++;
        } catch {
          break;
        }
      }

      return moveFile(sourcePath, destDir, path.basename(uniquePath), { ...options, overwrite: true });
    }
  } catch {
    // Destination doesn't exist, good to proceed
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      source: sourcePath,
      destination: destPath,
      action: copy ? 'copy' : 'move',
    };
  }

  try {
    if (copy) {
      await fs.copyFile(sourcePath, destPath);
    } else {
      await fs.rename(sourcePath, destPath);
    }

    return {
      success: true,
      source: sourcePath,
      destination: destPath,
      action: copy ? 'copy' : 'move',
    };
  } catch (error) {
    // If rename fails (cross-device), fall back to copy+delete
    if (error.code === 'EXDEV' && !copy) {
      await fs.copyFile(sourcePath, destPath);
      await fs.unlink(sourcePath);

      return {
        success: true,
        source: sourcePath,
        destination: destPath,
        action: 'move (cross-device)',
      };
    }

    return {
      success: false,
      source: sourcePath,
      destination: destPath,
      error: error.message,
    };
  }
}

/**
 * Move associated sidecar files (XMP, etc.)
 */
export async function moveSidecarFiles(sourcePath, destDir, newBasename, options = {}) {
  const sourceDir = path.dirname(sourcePath);
  const sourceBase = path.basename(sourcePath, path.extname(sourcePath));

  const sidecarExtensions = ['.xmp', '.XMP', '.pp3', '.dop'];
  const results = [];

  for (const ext of sidecarExtensions) {
    const sidecarSource = path.join(sourceDir, sourceBase + ext);

    try {
      await fs.access(sidecarSource);
      const sidecarDest = newBasename + ext.toLowerCase();
      const result = await moveFile(sidecarSource, destDir, sidecarDest, options);
      results.push(result);
    } catch {
      // Sidecar doesn't exist, skip
    }
  }

  return results;
}

/**
 * Generate manifest file for tracking changes
 * @param {Object[]} operations - Array of file operations
 * @param {string} outputPath - Manifest output path
 * @returns {Promise<void>}
 */
export async function generateManifest(operations, outputPath) {
  const manifest = {
    version: '1.0',
    created: new Date().toISOString(),
    operations: operations.map(op => ({
      original: {
        path: op.source,
        name: path.basename(op.source),
      },
      result: {
        path: op.destination,
        name: path.basename(op.destination),
      },
      action: op.action,
      success: op.success,
      analysis: op.analysis ? {
        score: op.analysis.scoring?.overall,
        rating: op.analysis.scoring?.rating,
        category: op.analysis.scoring?.classification?.category,
      } : null,
    })),
    summary: {
      total: operations.length,
      successful: operations.filter(o => o.success).length,
      failed: operations.filter(o => !o.success).length,
    },
  };

  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
}

/**
 * Restore files from manifest (undo)
 * @param {string} manifestPath - Path to manifest file
 * @param {Object} options - Restore options
 * @returns {Promise<Object[]>} Restore results
 */
export async function restoreFromManifest(manifestPath, options = {}) {
  const { dryRun = false } = options;

  const manifestData = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestData);

  const results = [];

  for (const op of manifest.operations) {
    if (!op.success) continue;

    try {
      const destDir = path.dirname(op.original.path);

      if (dryRun) {
        results.push({
          success: true,
          dryRun: true,
          from: op.result.path,
          to: op.original.path,
        });
      } else {
        await fs.rename(op.result.path, op.original.path);
        results.push({
          success: true,
          from: op.result.path,
          to: op.original.path,
        });
      }
    } catch (error) {
      results.push({
        success: false,
        from: op.result.path,
        to: op.original.path,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Organize analyzed images into folders
 * @param {Object[]} analyzedImages - Array of analyzed images
 * @param {string} outputDir - Output directory
 * @param {Object} options - Organization options
 * @returns {Promise<Object>} Organization results
 */
export async function organizeImages(analyzedImages, outputDir, options = {}) {
  const {
    copy = false,
    dryRun = false,
    includeScore = true,
    moveSidecars = true,
    createManifest = true,
  } = options;

  // Create directory structure
  const dirs = await createDirectoryStructure(outputDir, { createCategories: true });

  const operations = [];
  let sequence = 1;

  // Sort by score (best first) to maintain useful sequence
  const sorted = [...analyzedImages]
    .filter(img => img.success)
    .sort((a, b) => (b.scoring?.overall || 0) - (a.scoring?.overall || 0));

  for (const analysis of sorted) {
    const category = analysis.scoring?.classification?.category || 'review';
    const destDir = dirs.categories[category] || dirs.categories.review;

    const newFilename = generateFilename(analysis, sequence, { includeScore });

    const result = await moveFile(
      analysis.file.path,
      destDir,
      newFilename,
      { copy, dryRun }
    );

    result.analysis = analysis;
    operations.push(result);

    // Move sidecars
    if (moveSidecars && result.success && !dryRun) {
      const newBase = path.basename(newFilename, path.extname(newFilename));
      await moveSidecarFiles(analysis.file.path, destDir, newBase, { copy, dryRun });
    }

    sequence++;
  }

  // Generate manifest
  if (createManifest && !dryRun) {
    const manifestPath = path.join(outputDir, '_manifest.json');
    await generateManifest(operations, manifestPath);
  }

  // Calculate summary
  const summary = {
    total: operations.length,
    successful: operations.filter(o => o.success).length,
    failed: operations.filter(o => !o.success).length,
    byCategory: {},
  };

  for (const op of operations.filter(o => o.success)) {
    const cat = op.analysis?.scoring?.classification?.category || 'unknown';
    summary.byCategory[cat] = (summary.byCategory[cat] || 0) + 1;
  }

  return {
    operations,
    summary,
    outputDir,
    manifestPath: createManifest ? path.join(outputDir, '_manifest.json') : null,
  };
}

/**
 * Get list of supported files in a directory
 * @param {string} dirPath - Directory path
 * @param {Object} options - Scan options
 * @returns {Promise<string[]>} Array of file paths
 */
export async function scanDirectory(dirPath, options = {}) {
  const {
    recursive = false,
    extensions = [...config.supportedExtensions, ...config.imageExtensions],
  } = options;

  const files = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(dirPath);
  return files;
}

export default {
  generateFilename,
  createDirectoryStructure,
  moveFile,
  moveSidecarFiles,
  generateManifest,
  restoreFromManifest,
  organizeImages,
  scanDirectory,
};
