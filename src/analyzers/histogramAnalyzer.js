/**
 * Histogram Analyzer Module
 * Analyzes image histograms for exposure quality scoring
 */
import sharp from 'sharp';

/**
 * Analyze histogram and exposure quality
 * @param {Buffer} imageBuffer - Image buffer to analyze
 * @returns {Promise<Object>} Histogram analysis results
 */
export async function analyzeHistogram(imageBuffer) {
  if (!imageBuffer) {
    return createEmptyAnalysis();
  }

  try {
    const stats = await sharp(imageBuffer).stats();

    // Get histogram data per channel
    const histogram = await computeHistogram(imageBuffer);

    // Analyze overall exposure
    const exposureAnalysis = analyzeExposure(histogram, stats);

    // Analyze clipping
    const clippingAnalysis = analyzeClipping(histogram);

    // Analyze dynamic range
    const dynamicRange = analyzeDynamicRange(histogram);

    // Analyze contrast
    const contrastAnalysis = analyzeContrast(histogram, stats);

    // Calculate exposure score (0-100)
    const exposureScore = calculateExposureScore(exposureAnalysis, clippingAnalysis, dynamicRange);

    return {
      histogram: {
        red: histogram.red,
        green: histogram.green,
        blue: histogram.blue,
        luminance: histogram.luminance,
      },
      stats: {
        red: { mean: stats.channels[0].mean, std: stats.channels[0].stdev },
        green: { mean: stats.channels[1].mean, std: stats.channels[1].stdev },
        blue: { mean: stats.channels[2].mean, std: stats.channels[2].stdev },
      },
      exposure: exposureAnalysis,
      clipping: clippingAnalysis,
      dynamicRange,
      contrast: contrastAnalysis,
      score: exposureScore,
    };
  } catch (error) {
    console.error('Histogram analysis failed:', error.message);
    return createEmptyAnalysis();
  }
}

/**
 * Compute histogram for all channels
 */
async function computeHistogram(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .resize(800, 800, { fit: 'inside' }) // Resize for speed
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histogramRed = new Array(256).fill(0);
  const histogramGreen = new Array(256).fill(0);
  const histogramBlue = new Array(256).fill(0);
  const histogramLuminance = new Array(256).fill(0);

  const channels = info.channels;
  const totalPixels = info.width * info.height;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    histogramRed[r]++;
    histogramGreen[g]++;
    histogramBlue[b]++;

    // Calculate luminance (perceived brightness)
    const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogramLuminance[luminance]++;
  }

  // Normalize to percentages
  const normalize = (hist) => hist.map(v => (v / totalPixels) * 100);

  return {
    red: normalize(histogramRed),
    green: normalize(histogramGreen),
    blue: normalize(histogramBlue),
    luminance: normalize(histogramLuminance),
    totalPixels,
  };
}

/**
 * Analyze overall exposure
 */
function analyzeExposure(histogram, stats) {
  const luminance = histogram.luminance;

  // Calculate weighted average brightness
  let totalWeight = 0;
  let weightedSum = 0;
  for (let i = 0; i < 256; i++) {
    weightedSum += i * luminance[i];
    totalWeight += luminance[i];
  }
  const meanBrightness = weightedSum / totalWeight;

  // Define exposure zones
  const shadows = luminance.slice(0, 64).reduce((a, b) => a + b, 0);
  const midtones = luminance.slice(64, 192).reduce((a, b) => a + b, 0);
  const highlights = luminance.slice(192, 256).reduce((a, b) => a + b, 0);

  // Determine exposure assessment
  let assessment;
  let deviation = 0;

  if (meanBrightness < 80) {
    assessment = 'underexposed';
    deviation = (80 - meanBrightness) / 80;
  } else if (meanBrightness > 180) {
    assessment = 'overexposed';
    deviation = (meanBrightness - 180) / 75;
  } else if (meanBrightness >= 100 && meanBrightness <= 160) {
    assessment = 'well-exposed';
    deviation = 0;
  } else if (meanBrightness < 100) {
    assessment = 'slightly-under';
    deviation = (100 - meanBrightness) / 100;
  } else {
    assessment = 'slightly-over';
    deviation = (meanBrightness - 160) / 60;
  }

  // Analyze histogram shape
  const shape = analyzeHistogramShape(luminance);

  return {
    meanBrightness: Math.round(meanBrightness),
    assessment,
    deviation: Math.min(1, deviation),
    zones: {
      shadows: Math.round(shadows * 100) / 100,
      midtones: Math.round(midtones * 100) / 100,
      highlights: Math.round(highlights * 100) / 100,
    },
    shape,
  };
}

/**
 * Analyze histogram shape
 */
function analyzeHistogramShape(luminance) {
  // Find peaks
  const peaks = [];
  for (let i = 5; i < 251; i++) {
    const local = luminance.slice(i - 5, i + 6);
    const center = luminance[i];
    if (center > 0.5 && center === Math.max(...local)) {
      peaks.push({ position: i, value: center });
    }
  }

  // Determine shape type
  if (peaks.length === 1) {
    const peakPos = peaks[0].position;
    if (peakPos < 80) return 'low-key';
    if (peakPos > 180) return 'high-key';
    return 'normal';
  } else if (peaks.length === 2) {
    const dist = Math.abs(peaks[0].position - peaks[1].position);
    if (dist > 100) return 'bimodal-contrast';
    return 'bimodal';
  } else if (peaks.length > 2) {
    return 'multi-modal';
  }

  // Check if flat/uniform
  const variance = calculateVariance(luminance);
  if (variance < 0.1) return 'flat';

  return 'normal';
}

/**
 * Analyze clipping (blown highlights and crushed shadows)
 */
function analyzeClipping(histogram) {
  const luminance = histogram.luminance;

  // Pure black (0-5) and pure white (250-255)
  const shadowClipped = luminance.slice(0, 6).reduce((a, b) => a + b, 0);
  const highlightClipped = luminance.slice(250, 256).reduce((a, b) => a + b, 0);

  // Near-clipping zones (potentially recoverable)
  const nearShadowClip = luminance.slice(6, 20).reduce((a, b) => a + b, 0);
  const nearHighlightClip = luminance.slice(235, 250).reduce((a, b) => a + b, 0);

  return {
    shadows: {
      clipped: Math.round(shadowClipped * 100) / 100,
      nearClip: Math.round(nearShadowClip * 100) / 100,
      severity: getSeverity(shadowClipped),
    },
    highlights: {
      clipped: Math.round(highlightClipped * 100) / 100,
      nearClip: Math.round(nearHighlightClip * 100) / 100,
      severity: getSeverity(highlightClipped),
    },
    totalClipped: Math.round((shadowClipped + highlightClipped) * 100) / 100,
    recoverable: shadowClipped < 5 && highlightClipped < 5,
  };
}

/**
 * Get severity level based on percentage
 */
function getSeverity(percentage) {
  if (percentage < 1) return 'none';
  if (percentage < 5) return 'minor';
  if (percentage < 15) return 'moderate';
  if (percentage < 30) return 'severe';
  return 'critical';
}

/**
 * Analyze dynamic range
 */
function analyzeDynamicRange(histogram) {
  const luminance = histogram.luminance;

  // Find actual range used (first and last non-trivial values)
  let minUsed = 0;
  let maxUsed = 255;

  for (let i = 0; i < 256; i++) {
    if (luminance[i] > 0.1) {
      minUsed = i;
      break;
    }
  }

  for (let i = 255; i >= 0; i--) {
    if (luminance[i] > 0.1) {
      maxUsed = i;
      break;
    }
  }

  const rangeUsed = maxUsed - minUsed;
  const rangePercentage = (rangeUsed / 255) * 100;

  let assessment;
  if (rangePercentage > 80) assessment = 'excellent';
  else if (rangePercentage > 60) assessment = 'good';
  else if (rangePercentage > 40) assessment = 'moderate';
  else if (rangePercentage > 20) assessment = 'limited';
  else assessment = 'very-limited';

  return {
    min: minUsed,
    max: maxUsed,
    range: rangeUsed,
    percentage: Math.round(rangePercentage),
    assessment,
    // Estimate stops of dynamic range (rough approximation)
    estimatedStops: Math.round(Math.log2(rangeUsed + 1) * 10) / 10,
  };
}

/**
 * Analyze contrast
 */
function analyzeContrast(histogram, stats) {
  // Use standard deviation as contrast indicator
  const avgStd = (stats.channels[0].stdev + stats.channels[1].stdev + stats.channels[2].stdev) / 3;

  // Calculate local contrast using histogram
  const luminance = histogram.luminance;
  const variance = calculateVariance(luminance);

  let level;
  if (avgStd > 70) level = 'high';
  else if (avgStd > 50) level = 'medium-high';
  else if (avgStd > 30) level = 'medium';
  else if (avgStd > 15) level = 'low';
  else level = 'very-low';

  return {
    standardDeviation: Math.round(avgStd),
    level,
    variance: Math.round(variance * 1000) / 1000,
  };
}

/**
 * Calculate variance of an array
 */
function calculateVariance(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate final exposure score (0-100)
 * More lenient scoring - most well-exposed photos should score 70+
 */
function calculateExposureScore(exposure, clipping, dynamicRange) {
  let score = 85; // Start higher - assume decent exposure

  // Penalize for exposure deviation, but less harshly
  score -= exposure.deviation * 20;

  // Penalize for clipping, but only if significant
  if (clipping.shadows.clipped > 2) {
    score -= Math.min(15, (clipping.shadows.clipped - 2) * 1.5);
  }
  if (clipping.highlights.clipped > 2) {
    score -= Math.min(20, (clipping.highlights.clipped - 2) * 2);
  }

  // Penalize for limited dynamic range, but less aggressively
  if (dynamicRange.assessment === 'very-limited') score -= 10;
  else if (dynamicRange.assessment === 'limited') score -= 5;

  // Bonus for good midtone distribution
  if (exposure.zones.midtones > 50) score += 5;

  // Bonus for good dynamic range
  if (dynamicRange.assessment === 'excellent') score += 5;
  else if (dynamicRange.assessment === 'good') score += 3;

  // Cap score
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Create empty analysis result
 */
function createEmptyAnalysis() {
  return {
    histogram: null,
    stats: null,
    exposure: { meanBrightness: 0, assessment: 'unknown', deviation: 1 },
    clipping: { shadows: { clipped: 0 }, highlights: { clipped: 0 }, totalClipped: 0, recoverable: true },
    dynamicRange: { range: 0, percentage: 0, assessment: 'unknown' },
    contrast: { standardDeviation: 0, level: 'unknown' },
    score: 0,
  };
}

/**
 * Quick exposure check without full analysis
 */
export async function quickExposureCheck(imageBuffer) {
  if (!imageBuffer) return { ok: false, issue: 'no-image' };

  try {
    const stats = await sharp(imageBuffer).stats();
    const avgMean = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;

    if (avgMean < 30) return { ok: false, issue: 'severely-underexposed' };
    if (avgMean > 230) return { ok: false, issue: 'severely-overexposed' };
    if (avgMean < 60) return { ok: true, issue: 'underexposed' };
    if (avgMean > 200) return { ok: true, issue: 'overexposed' };
    return { ok: true, issue: null };
  } catch {
    return { ok: false, issue: 'analysis-failed' };
  }
}

export default {
  analyzeHistogram,
  quickExposureCheck,
};
