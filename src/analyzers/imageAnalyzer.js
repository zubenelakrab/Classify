/**
 * Image Analyzer - Main orchestrator
 * Coordinates all analysis modules and produces comprehensive results
 */
import { extractExif, closeExifTool } from './exifParser.js';
import { extractPreview, cleanupTempDir } from './previewExtractor.js';
import { analyzeHistogram } from './histogramAnalyzer.js';
import { analyzeSharpness } from './sharpnessAnalyzer.js';
import { analyzeComposition } from './compositionAnalyzer.js';
import { calculateScores } from './scoringEngine.js';
import path from 'path';

/**
 * Perform complete analysis on a single image
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis results
 */
export async function analyzeImage(filePath, options = {}) {
  const {
    skipComposition = false,
    mode = 'general',
    customWeights = null,
  } = options;

  const startTime = Date.now();
  const fileName = path.basename(filePath);

  try {
    // Step 1: Extract EXIF metadata
    const exif = await extractExif(filePath);

    // Step 2: Extract preview for analysis
    const preview = await extractPreview(filePath, { maxSize: 1200 });

    if (!preview.buffer) {
      return {
        file: {
          path: filePath,
          name: fileName,
          error: preview.error || 'Failed to extract preview',
        },
        success: false,
        error: 'Could not extract preview from file',
      };
    }

    // Step 3: Run analyses in parallel where possible
    const [histogram, sharpness] = await Promise.all([
      analyzeHistogram(preview.buffer),
      analyzeSharpness(preview.buffer),
    ]);

    // Step 4: Composition analysis
    let composition = null;
    if (!skipComposition) {
      composition = await analyzeComposition(preview.buffer);
    }

    // Step 5: Calculate final scores
    const scoring = calculateScores(
      { exif, histogram, sharpness, composition },
      { mode, customWeights }
    );

    const analysisTime = Date.now() - startTime;

    return {
      file: {
        path: filePath,
        name: fileName,
        size: exif.file?.size || 0,
        type: exif.file?.type || path.extname(filePath),
      },
      success: true,
      exif,
      preview: {
        width: preview.width,
        height: preview.height,
        originalWidth: preview.originalWidth,
        originalHeight: preview.originalHeight,
      },
      analysis: {
        histogram,
        sharpness,
        composition,
      },
      scoring,
      timing: {
        total: analysisTime,
      },
    };
  } catch (error) {
    return {
      file: {
        path: filePath,
        name: fileName,
      },
      success: false,
      error: error.message,
    };
  }
}

/**
 * Analyze multiple images with progress callback
 * @param {string[]} filePaths - Array of file paths
 * @param {Object} options - Analysis options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object[]>} Array of analysis results
 */
export async function analyzeImages(filePaths, options = {}, onProgress = null) {
  const {
    concurrency = 4,
    ...analysisOptions
  } = options;

  const results = [];
  const total = filePaths.length;
  let completed = 0;

  // Process in batches for controlled concurrency
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        const result = await analyzeImage(filePath, analysisOptions);
        completed++;

        if (onProgress) {
          onProgress({
            completed,
            total,
            current: filePath,
            result,
          });
        }

        return result;
      })
    );

    results.push(...batchResults);
  }

  return results;
}

/**
 * Quick analysis for sorting/filtering (faster, less detailed)
 */
export async function quickAnalyze(filePath) {
  const startTime = Date.now();

  try {
    const exif = await extractExif(filePath);
    const preview = await extractPreview(filePath, { maxSize: 800 });

    if (!preview.buffer) {
      return { success: false, error: 'No preview' };
    }

    // Run only essential analyses
    const [histogram, sharpness] = await Promise.all([
      analyzeHistogram(preview.buffer),
      analyzeSharpness(preview.buffer),
    ]);

    // Simple scoring without full composition
    const scoring = calculateScores(
      { exif, histogram, sharpness, composition: null },
      { mode: 'general' }
    );

    return {
      success: true,
      file: path.basename(filePath),
      score: scoring.overall,
      rating: scoring.rating,
      category: scoring.classification.category,
      sharpness: sharpness?.overall?.assessment || 'unknown',
      exposure: histogram?.exposure?.assessment || 'unknown',
      timing: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Detect burst groups from analyzed images
 */
export function detectBurstGroups(analyzedImages, maxIntervalMs = 1000) {
  const groups = [];
  let currentGroup = [];

  // Sort by timestamp
  const sorted = [...analyzedImages]
    .filter(img => img.success && img.exif?.timestamp?.taken)
    .sort((a, b) => {
      const timeA = new Date(a.exif.timestamp.taken).getTime();
      const timeB = new Date(b.exif.timestamp.taken).getTime();
      return timeA - timeB;
    });

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentTime = new Date(current.exif.timestamp.taken).getTime();

    if (currentGroup.length === 0) {
      currentGroup.push(current);
    } else {
      const lastTime = new Date(currentGroup[currentGroup.length - 1].exif.timestamp.taken).getTime();
      const interval = currentTime - lastTime;

      if (interval <= maxIntervalMs) {
        currentGroup.push(current);
      } else {
        // Save current group if it has multiple images
        if (currentGroup.length >= 2) {
          groups.push({
            images: currentGroup,
            size: currentGroup.length,
            timeSpan: currentTime - new Date(currentGroup[0].exif.timestamp.taken).getTime(),
          });
        }
        currentGroup = [current];
      }
    }
  }

  // Don't forget the last group
  if (currentGroup.length >= 2) {
    groups.push({
      images: currentGroup,
      size: currentGroup.length,
      timeSpan: new Date(currentGroup[currentGroup.length - 1].exif.timestamp.taken).getTime() -
                new Date(currentGroup[0].exif.timestamp.taken).getTime(),
    });
  }

  return groups;
}

/**
 * Detect shooting sessions by time gaps
 */
export function detectSessions(analyzedImages, gapMinutes = 30) {
  const sessions = [];
  let currentSession = [];
  const gapMs = gapMinutes * 60 * 1000;

  const sorted = [...analyzedImages]
    .filter(img => img.success && img.exif?.timestamp?.taken)
    .sort((a, b) => {
      const timeA = new Date(a.exif.timestamp.taken).getTime();
      const timeB = new Date(b.exif.timestamp.taken).getTime();
      return timeA - timeB;
    });

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentTime = new Date(current.exif.timestamp.taken).getTime();

    if (currentSession.length === 0) {
      currentSession.push(current);
    } else {
      const lastTime = new Date(currentSession[currentSession.length - 1].exif.timestamp.taken).getTime();

      if (currentTime - lastTime <= gapMs) {
        currentSession.push(current);
      } else {
        sessions.push(createSessionSummary(currentSession, sessions.length + 1));
        currentSession = [current];
      }
    }
  }

  if (currentSession.length > 0) {
    sessions.push(createSessionSummary(currentSession, sessions.length + 1));
  }

  return sessions;
}

/**
 * Create summary for a session
 */
function createSessionSummary(images, index) {
  const firstTime = new Date(images[0].exif.timestamp.taken);
  const lastTime = new Date(images[images.length - 1].exif.timestamp.taken);

  const scores = images.map(img => img.scoring?.overall || 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    index,
    images,
    count: images.length,
    startTime: firstTime,
    endTime: lastTime,
    duration: lastTime - firstTime,
    stats: {
      averageScore: Math.round(avgScore),
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
    },
  };
}

/**
 * Cleanup resources
 */
export async function cleanup() {
  await closeExifTool();
  await cleanupTempDir();
}

export default {
  analyzeImage,
  analyzeImages,
  quickAnalyze,
  detectBurstGroups,
  detectSessions,
  cleanup,
};
