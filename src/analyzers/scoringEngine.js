/**
 * Scoring Engine Module
 * Combines all analysis results into final quality scores
 */
import config from '../../config/default.js';

/**
 * Calculate comprehensive quality scores from all analyses
 * @param {Object} analyses - Object containing all analysis results
 * @param {Object} options - Scoring options
 * @returns {Object} Final scoring results
 */
export function calculateScores(analyses, options = {}) {
  const {
    exif,
    histogram,
    sharpness,
    composition,
  } = analyses;

  const {
    mode = 'general',  // 'general', 'landscape'
    customWeights = null,
  } = options;

  // Use the requested mode
  const actualMode = mode === 'portrait' ? 'general' : mode; // Portrait mode no longer supported
  const actualWeights = customWeights || config.weights[actualMode] || config.weights.general;

  // Calculate individual scores
  const scores = {
    sharpness: calculateSharpnessScore(sharpness),
    exposure: calculateExposureScore(histogram),
    focusAccuracy: calculateFocusAccuracyScore(sharpness, exif),
    composition: composition?.score?.score || 60, // Default to 60 (slightly above average)
    noise: calculateNoiseScore(exif, histogram),
    dynamicRange: histogram?.dynamicRange?.percentage || 60,
    horizonLevel: composition?.horizon?.detected ? (composition.horizon.level ? 100 : Math.max(50, 100 - Math.abs(composition.horizon.tilt) * 5)) : null,
  };

  // Calculate weighted overall score
  let weightedSum = 0;
  let weightTotal = 0;

  for (const [key, weight] of Object.entries(actualWeights)) {
    if (scores[key] !== null && scores[key] !== undefined) {
      weightedSum += scores[key] * weight;
      weightTotal += weight;
    }
  }

  const overallScore = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Determine star rating
  const rating = calculateStarRating(overallScore);

  // Determine classification
  const classification = classifyImage(overallScore, scores, analyses);

  // Generate issues list
  const issues = generateIssuesList(scores, analyses);

  // Calculate keeper probability
  const keeperProbability = calculateKeeperProbability(overallScore, issues);

  return {
    scores,
    overall: Math.round(overallScore),
    rating,
    classification,
    issues,
    keeperProbability,
    mode: actualMode,
    weights: actualWeights,
  };
}

/**
 * Calculate sharpness score
 * NOTE: Blur penalties are already applied in sharpnessAnalyzer.js - don't double-penalize here
 */
function calculateSharpnessScore(sharpness) {
  if (!sharpness) return 50;

  let score = sharpness.overall?.score || 0;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculate exposure score from histogram analysis
 */
function calculateExposureScore(histogram) {
  if (!histogram) return 50;
  return histogram.score || 50;
}

/**
 * Calculate focus accuracy score
 */
function calculateFocusAccuracyScore(sharpness, exif) {
  if (!sharpness) return 50;

  let score = 70; // Base score

  // Use general sharpness distribution
  const sharpestRegions = sharpness.focusPlane?.sharpestRegions || [];
  if (sharpestRegions.includes('center')) {
    score = 85;
  } else if (sharpestRegions.length > 0) {
    score = 75;
  }

  // Consider EXIF focus info
  if (exif?.focus?.continuous) {
    // Continuous focus is harder to nail
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate noise score based on ISO and exposure
 */
function calculateNoiseScore(exif, histogram) {
  if (!exif?.exposure?.iso) return 80; // Unknown = assume decent

  const iso = exif.exposure.iso;

  let score;
  if (iso <= 200) score = 100;
  else if (iso <= 400) score = 95;
  else if (iso <= 800) score = 85;
  else if (iso <= 1600) score = 75;
  else if (iso <= 3200) score = 60;
  else if (iso <= 6400) score = 45;
  else if (iso <= 12800) score = 30;
  else score = 15;

  // Penalize further if shadows are pushed (high shadow area + high ISO)
  if (histogram?.exposure?.zones?.shadows > 30 && iso > 1600) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate star rating (1-5)
 */
function calculateStarRating(score) {
  const thresholds = config.thresholds;

  if (score >= thresholds.select) return 5;
  if (score >= thresholds.good) return 4;
  if (score >= thresholds.review) return 3;
  if (score >= thresholds.maybe) return 2;
  return 1;
}

/**
 * Classify image into category
 */
function classifyImage(score, scores, analyses) {
  const thresholds = config.thresholds;

  let category;
  if (score >= thresholds.select) category = 'select';
  else if (score >= thresholds.good) category = 'good';
  else if (score >= thresholds.review) category = 'review';
  else if (score >= thresholds.maybe) category = 'maybe';
  else category = 'reject';

  // Determine strongest and weakest aspects
  const sortedScores = Object.entries(scores)
    .filter(([_, v]) => v !== null)
    .sort((a, b) => b[1] - a[1]);

  const strongest = sortedScores[0]?.[0] || null;
  const weakest = sortedScores[sortedScores.length - 1]?.[0] || null;

  // Check for auto-reject conditions
  const autoReject = checkAutoReject(analyses);

  return {
    category: autoReject.shouldReject ? 'reject' : category,
    folder: config.folders[autoReject.shouldReject ? 'reject' : category],
    strongest,
    weakest,
    autoReject: autoReject.shouldReject ? autoReject.reasons : null,
  };
}

/**
 * Check for automatic rejection conditions
 */
function checkAutoReject(analyses) {
  const reasons = [];
  const { sharpness, histogram } = analyses;
  const thresholds = config.autoReject;

  // Check motion blur
  if (sharpness?.blur?.type === 'motion' && sharpness.blur.severity >= thresholds.motionBlurSeverity) {
    reasons.push('severe-motion-blur');
  }

  // Check defocus
  if (sharpness?.blur?.type === 'defocus' && sharpness.blur.severity >= thresholds.defocusSeverity) {
    reasons.push('severely-out-of-focus');
  }

  // Check clipping
  if (histogram?.clipping?.highlights?.clipped >= thresholds.highlightClip) {
    reasons.push('blown-highlights');
  }
  if (histogram?.clipping?.shadows?.clipped >= thresholds.shadowClip) {
    reasons.push('crushed-shadows');
  }

  return {
    shouldReject: reasons.length > 0,
    reasons,
  };
}

/**
 * Generate list of issues/suggestions
 */
function generateIssuesList(scores, analyses) {
  const issues = [];

  // Sharpness issues
  if (scores.sharpness < 60) {
    if (analyses.sharpness?.blur?.type === 'motion') {
      issues.push({
        type: 'sharpness',
        severity: 'high',
        message: 'Motion blur detected',
        suggestion: 'Use faster shutter speed',
      });
    } else if (analyses.sharpness?.blur?.type === 'defocus') {
      issues.push({
        type: 'sharpness',
        severity: 'high',
        message: 'Subject out of focus',
        suggestion: 'Check focus point or use smaller aperture',
      });
    } else {
      issues.push({
        type: 'sharpness',
        severity: 'medium',
        message: 'Image is soft',
        suggestion: 'Consider increasing sharpening in post',
      });
    }
  }

  // Exposure issues
  if (analyses.histogram?.exposure) {
    const exposure = analyses.histogram.exposure;
    if (exposure.assessment === 'underexposed') {
      issues.push({
        type: 'exposure',
        severity: 'medium',
        message: 'Underexposed',
        suggestion: 'Increase exposure or brighten shadows in post',
      });
    } else if (exposure.assessment === 'overexposed') {
      issues.push({
        type: 'exposure',
        severity: 'medium',
        message: 'Overexposed',
        suggestion: 'Check for recoverable highlights',
      });
    }
  }

  // Clipping issues
  if (analyses.histogram?.clipping) {
    const clipping = analyses.histogram.clipping;
    if (clipping.highlights.severity === 'moderate' || clipping.highlights.severity === 'severe') {
      issues.push({
        type: 'clipping',
        severity: clipping.highlights.severity === 'severe' ? 'high' : 'medium',
        message: `${Math.round(clipping.highlights.clipped)}% highlights blown`,
        suggestion: clipping.highlights.clipped < 10 ? 'May be recoverable' : 'Likely unrecoverable',
      });
    }
  }

  // Composition issues
  if (analyses.composition?.horizon?.detected && !analyses.composition.horizon.level) {
    const tilt = Math.abs(analyses.composition.horizon.tilt);
    if (tilt > 2) {
      issues.push({
        type: 'composition',
        severity: tilt > 5 ? 'medium' : 'low',
        message: `Horizon tilted ${tilt.toFixed(1)}°`,
        suggestion: 'Straighten in post',
      });
    }
  }

  // Noise warning
  if (scores.noise < 50) {
    issues.push({
      type: 'noise',
      severity: 'low',
      message: 'High ISO may result in visible noise',
      suggestion: 'Apply noise reduction in post',
    });
  }

  return issues;
}

/**
 * Calculate probability that user will keep this image
 */
function calculateKeeperProbability(score, issues) {
  let probability = score / 100;

  // Reduce probability based on critical issues
  const criticalIssues = issues.filter(i => i.severity === 'high');
  probability -= criticalIssues.length * 0.15;

  // Reduce for medium issues
  const mediumIssues = issues.filter(i => i.severity === 'medium');
  probability -= mediumIssues.length * 0.05;

  return Math.max(0, Math.min(1, Math.round(probability * 100) / 100));
}

/**
 * Compare two images and determine which is better
 */
export function compareImages(scoreA, scoreB) {
  const diff = scoreA.overall - scoreB.overall;

  return {
    winner: diff > 0 ? 'A' : diff < 0 ? 'B' : 'tie',
    scoreDiff: Math.abs(diff),
    comparison: {
      sharpness: (scoreA.scores.sharpness || 0) - (scoreB.scores.sharpness || 0),
      exposure: (scoreA.scores.exposure || 0) - (scoreB.scores.exposure || 0),
      composition: (scoreA.scores.composition || 0) - (scoreB.scores.composition || 0),
    },
  };
}

/**
 * Find best image in a group (burst)
 */
export function findBestInGroup(images) {
  if (images.length === 0) return null;
  if (images.length === 1) return { best: images[0], index: 0 };

  let bestIndex = 0;
  let bestScore = images[0].scoring?.overall || 0;

  for (let i = 1; i < images.length; i++) {
    const score = images[i].scoring?.overall || 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return {
    best: images[bestIndex],
    index: bestIndex,
    scores: images.map((img, i) => ({
      index: i,
      score: img.scoring?.overall || 0,
      isBest: i === bestIndex,
    })),
  };
}

export default {
  calculateScores,
  compareImages,
  findBestInGroup,
};
