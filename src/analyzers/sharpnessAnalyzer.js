/**
 * Sharpness Analyzer Module
 * Detects image sharpness, blur type, and focus accuracy
 */
import sharp from 'sharp';

/**
 * Analyze image sharpness
 * @param {Buffer} imageBuffer - Image buffer to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Sharpness analysis results
 */
export async function analyzeSharpness(imageBuffer, options = {}) {
  if (!imageBuffer) {
    return createEmptyAnalysis();
  }

  const {
    regionSize = 64,      // Size of regions to analyze
    gridSize = 5,         // Grid divisions (5x5 = 25 regions)
  } = options;

  try {
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();

    // Convert to grayscale for sharpness analysis
    const { data, info } = await sharp(imageBuffer)
      .resize(800, 800, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate overall sharpness using Laplacian variance
    const overallSharpness = calculateLaplacianVariance(data, info.width, info.height);

    // Analyze sharpness in different regions
    const regionAnalysis = analyzeRegions(data, info.width, info.height, gridSize);

    // Detect blur type
    const blurAnalysis = detectBlurType(data, info.width, info.height, overallSharpness);

    // Calculate edge strength
    const edgeAnalysis = analyzeEdges(data, info.width, info.height);

    // Determine focus plane (where is it sharpest?)
    const focusPlane = determineFocusPlane(regionAnalysis);

    // Calculate final sharpness score
    const score = calculateSharpnessScore(overallSharpness, blurAnalysis, edgeAnalysis, focusPlane);

    return {
      overall: {
        variance: Math.round(overallSharpness * 100) / 100,
        score: score,
        assessment: getSharpnessAssessment(score),
      },
      regions: regionAnalysis,
      blur: blurAnalysis,
      edges: edgeAnalysis,
      focusPlane,
      dimensions: {
        analyzed: { width: info.width, height: info.height },
        original: { width: metadata.width, height: metadata.height },
      },
    };
  } catch (error) {
    console.error('Sharpness analysis failed:', error.message);
    return createEmptyAnalysis();
  }
}

/**
 * Calculate Laplacian variance (measure of sharpness)
 * Higher variance = sharper image
 * Sharp images have high variation in Laplacian response (lots of edges)
 * Blurry images have low variation (smooth transitions)
 */
function calculateLaplacianVariance(data, width, height) {
  // Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Apply Laplacian kernel - detects edges (second derivative)
      const laplacian =
        data[idx - width] +     // top
        data[idx - 1] +         // left
        -4 * data[idx] +        // center
        data[idx + 1] +         // right
        data[idx + width];      // bottom

      // Use absolute value of Laplacian response for variance calculation
      // This ensures sharp edges contribute positively regardless of direction
      const absLaplacian = Math.abs(laplacian);
      sum += absLaplacian;
      sumSq += absLaplacian * absLaplacian;
      count++;
    }
  }

  // Calculate variance of absolute Laplacian values
  // Higher variance = more varied edge responses = sharper image
  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);

  // Return variance (always positive due to abs)
  return variance;
}

/**
 * Analyze sharpness in grid regions
 */
function analyzeRegions(data, width, height, gridSize) {
  const regions = [];
  const regionWidth = Math.floor(width / gridSize);
  const regionHeight = Math.floor(height / gridSize);

  let maxSharpness = 0;
  let minSharpness = Infinity;

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const startX = gx * regionWidth;
      const startY = gy * regionHeight;

      // Extract region data
      const regionData = extractRegion(data, width, startX, startY, regionWidth, regionHeight);
      const sharpness = calculateLaplacianVariance(regionData, regionWidth, regionHeight);

      maxSharpness = Math.max(maxSharpness, sharpness);
      minSharpness = Math.min(minSharpness, sharpness);

      regions.push({
        x: gx,
        y: gy,
        sharpness: Math.round(sharpness * 100) / 100,
        position: getRegionPosition(gx, gy, gridSize),
      });
    }
  }

  // Normalize sharpness values
  const range = maxSharpness - minSharpness || 1;
  regions.forEach(r => {
    r.normalizedSharpness = Math.round(((r.sharpness - minSharpness) / range) * 100);
  });

  return {
    grid: regions,
    max: Math.round(maxSharpness * 100) / 100,
    min: Math.round(minSharpness * 100) / 100,
    variance: Math.round((maxSharpness - minSharpness) * 100) / 100,
  };
}

/**
 * Extract a region from image data
 */
function extractRegion(data, stride, startX, startY, regionWidth, regionHeight) {
  const region = new Uint8Array(regionWidth * regionHeight);
  for (let y = 0; y < regionHeight; y++) {
    for (let x = 0; x < regionWidth; x++) {
      region[y * regionWidth + x] = data[(startY + y) * stride + (startX + x)];
    }
  }
  return region;
}

/**
 * Get human-readable position name
 */
function getRegionPosition(x, y, gridSize) {
  const midPoint = Math.floor(gridSize / 2);

  let vertical, horizontal;

  if (y < midPoint) vertical = 'top';
  else if (y > midPoint) vertical = 'bottom';
  else vertical = 'middle';

  if (x < midPoint) horizontal = 'left';
  else if (x > midPoint) horizontal = 'right';
  else horizontal = 'center';

  if (vertical === 'middle' && horizontal === 'center') return 'center';
  if (vertical === 'middle') return horizontal;
  if (horizontal === 'center') return vertical;
  return `${vertical}-${horizontal}`;
}

/**
 * Detect type of blur present
 * VERY CONSERVATIVE - only flag truly problematic blur
 */
function detectBlurType(data, width, height, overallSharpness) {
  // Analyze directional gradients
  const horizontalGradient = calculateDirectionalGradient(data, width, height, 'horizontal');
  const verticalGradient = calculateDirectionalGradient(data, width, height, 'vertical');

  // Calculate gradient ratio
  const gradientRatio = horizontalGradient / (verticalGradient || 1);

  // Analyze gradient consistency (for motion blur detection)
  const gradientConsistency = analyzeGradientConsistency(data, width, height);

  // Determine blur type - VERY conservative thresholds
  // Most images should be classified as 'none' or 'soft' (which has no penalty)
  let blurType = 'none';
  let severity = 0;
  let direction = null;

  // Calculate edge strength for better blur detection
  // Low edge strength + low Laplacian = actually blurry
  const avgGradient = (horizontalGradient + verticalGradient) / 2;

  // Sharp or acceptable image - no blur flag
  if (overallSharpness > 100 || avgGradient > 20) {
    blurType = 'none';
    severity = 0;
  }
  // Check for motion blur (directional) - only if VERY obvious
  // Requires: strong directional bias AND low sharpness AND low average gradient
  else if (Math.abs(gradientRatio - 1) > 0.5 && overallSharpness < 50 && avgGradient < 15) {
    blurType = 'motion';
    severity = Math.max(0, Math.min(1, 1 - (overallSharpness / 50)));
    direction = gradientRatio > 1 ? 'horizontal' : 'vertical';
  }
  // Check for defocus blur (uniform) - only if VERY soft
  // Requires: very low sharpness AND uniform blur pattern AND low edge strength
  else if (overallSharpness < 40 && gradientConsistency > 0.9 && avgGradient < 12) {
    blurType = 'defocus';
    severity = Math.max(0, Math.min(1, 1 - (overallSharpness / 40)));
  }
  // Slight softness - informational only, no penalty
  else if (overallSharpness < 80) {
    blurType = 'soft';
    severity = 0.2; // Low severity - just informational
  }

  return {
    type: blurType,
    severity: Math.min(1, Math.max(0, severity)),
    direction,
    metrics: {
      horizontalGradient: Math.round(horizontalGradient),
      verticalGradient: Math.round(verticalGradient),
      gradientRatio: Math.round(gradientRatio * 100) / 100,
      consistency: Math.round(gradientConsistency * 100) / 100,
      avgGradient: Math.round(avgGradient),
    },
  };
}

/**
 * Calculate directional gradient strength
 */
function calculateDirectionalGradient(data, width, height, direction) {
  let sum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      let gradient;
      if (direction === 'horizontal') {
        gradient = Math.abs(data[idx + 1] - data[idx - 1]);
      } else {
        gradient = Math.abs(data[idx + width] - data[idx - width]);
      }

      sum += gradient;
      count++;
    }
  }

  return sum / count;
}

/**
 * Analyze gradient consistency (helps detect motion blur)
 */
function analyzeGradientConsistency(data, width, height) {
  // Sample gradients at different positions
  const samples = [];
  const sampleCount = 20;

  for (let i = 0; i < sampleCount; i++) {
    const x = Math.floor(Math.random() * (width - 2)) + 1;
    const y = Math.floor(Math.random() * (height - 2)) + 1;
    const idx = y * width + x;

    const gx = data[idx + 1] - data[idx - 1];
    const gy = data[idx + width] - data[idx - width];
    const angle = Math.atan2(gy, gx);

    samples.push(angle);
  }

  // Calculate circular variance of angles
  let sumSin = 0;
  let sumCos = 0;
  for (const angle of samples) {
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }

  const R = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / sampleCount;
  return R; // 0 = random directions (defocus), 1 = consistent direction (motion)
}

/**
 * Analyze edge strength and distribution
 */
function analyzeEdges(data, width, height) {
  // Sobel edge detection
  let edgeSum = 0;
  let strongEdges = 0;
  let weakEdges = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Sobel X
      const gx =
        -data[idx - width - 1] + data[idx - width + 1] +
        -2 * data[idx - 1] + 2 * data[idx + 1] +
        -data[idx + width - 1] + data[idx + width + 1];

      // Sobel Y
      const gy =
        -data[idx - width - 1] - 2 * data[idx - width] - data[idx - width + 1] +
        data[idx + width - 1] + 2 * data[idx + width] + data[idx + width + 1];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeSum += magnitude;

      if (magnitude > 100) strongEdges++;
      else if (magnitude > 30) weakEdges++;

      count++;
    }
  }

  const avgEdgeStrength = edgeSum / count;
  const strongEdgeRatio = strongEdges / count;

  return {
    averageStrength: Math.round(avgEdgeStrength),
    strongEdgeRatio: Math.round(strongEdgeRatio * 10000) / 100,
    assessment: avgEdgeStrength > 50 ? 'strong' : avgEdgeStrength > 25 ? 'moderate' : 'weak',
  };
}

/**
 * Determine where the focus plane is
 */
function determineFocusPlane(regionAnalysis) {
  const regions = regionAnalysis.grid;

  // Find the sharpest regions
  const sorted = [...regions].sort((a, b) => b.sharpness - a.sharpness);
  const sharpest = sorted.slice(0, 5);

  // Calculate weighted center of sharpness
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;

  for (const region of sharpest) {
    const weight = region.sharpness;
    sumX += region.x * weight;
    sumY += region.y * weight;
    totalWeight += weight;
  }

  const centerX = sumX / totalWeight;
  const centerY = sumY / totalWeight;

  // Determine primary focus location
  const gridSize = Math.sqrt(regions.length);
  const midPoint = (gridSize - 1) / 2;

  let position;
  if (Math.abs(centerX - midPoint) < 0.7 && Math.abs(centerY - midPoint) < 0.7) {
    position = 'center';
  } else if (centerY < midPoint - 0.5) {
    position = centerX < midPoint ? 'top-left' : centerX > midPoint ? 'top-right' : 'top';
  } else if (centerY > midPoint + 0.5) {
    position = centerX < midPoint ? 'bottom-left' : centerX > midPoint ? 'bottom-right' : 'bottom';
  } else {
    position = centerX < midPoint ? 'left' : 'right';
  }

  return {
    position,
    sharpestRegions: sharpest.map(r => r.position),
    center: {
      x: Math.round(centerX * 100) / 100,
      y: Math.round(centerY * 100) / 100,
    },
  };
}

/**
 * Calculate final sharpness score (0-100)
 * Uses edge strength as primary metric since it's more reliable than variance alone.
 * Calibrated for RAW embedded previews (which are compressed JPEGs).
 */
function calculateSharpnessScore(overallSharpness, blurAnalysis, edgeAnalysis, focusPlane) {
  let score = 0;

  // PRIMARY: Use edge strength as the main sharpness indicator
  // Edge strength is more reliable and directly measures the presence of sharp details
  const edgeStrength = edgeAnalysis.averageStrength || 0;
  const strongEdgeRatio = edgeAnalysis.strongEdgeRatio || 0;

  // Edge-based score (0-100 scale)
  // Strong edges (>60) = sharp, moderate (30-60) = acceptable, weak (<30) = soft
  if (edgeStrength > 80) score = 90 + Math.min(10, (edgeStrength - 80) / 4);
  else if (edgeStrength > 60) score = 78 + ((edgeStrength - 60) / 20) * 12;
  else if (edgeStrength > 40) score = 65 + ((edgeStrength - 40) / 20) * 13;
  else if (edgeStrength > 25) score = 52 + ((edgeStrength - 25) / 15) * 13;
  else if (edgeStrength > 15) score = 40 + ((edgeStrength - 15) / 10) * 12;
  else score = 30 + (edgeStrength / 15) * 10;

  // SECONDARY: Boost from strong edge ratio (lots of well-defined details)
  if (strongEdgeRatio > 5) score += 5;
  else if (strongEdgeRatio > 2) score += 3;

  // SECONDARY: Slight boost from high Laplacian variance (confirms sharp)
  if (overallSharpness > 500) score += 3;
  else if (overallSharpness > 300) score += 2;

  // PENALTY: Only penalize obvious blur (very conservative)
  if (blurAnalysis.type === 'motion' && blurAnalysis.severity > 0.6) {
    score -= (blurAnalysis.severity - 0.6) * 25;
  } else if (blurAnalysis.type === 'defocus' && blurAnalysis.severity > 0.6) {
    score -= (blurAnalysis.severity - 0.6) * 20;
  }
  // Note: 'soft' blur type is not penalized - just means not razor sharp

  // BONUS: Focus in center (often intentional)
  if (focusPlane.position === 'center') {
    score += 2;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get human-readable sharpness assessment
 */
function getSharpnessAssessment(score) {
  if (score >= 90) return 'tack-sharp';
  if (score >= 75) return 'sharp';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'soft';
  if (score >= 20) return 'very-soft';
  return 'unusable';
}

/**
 * Create empty analysis result
 */
function createEmptyAnalysis() {
  return {
    overall: { variance: 0, score: 0, assessment: 'unknown' },
    regions: { grid: [], max: 0, min: 0, variance: 0 },
    blur: { type: 'unknown', severity: 0, direction: null },
    edges: { averageStrength: 0, strongEdgeRatio: 0, assessment: 'unknown' },
    focusPlane: { position: 'unknown', sharpestRegions: [], center: { x: 0, y: 0 } },
  };
}

/**
 * Quick sharpness check without full analysis
 */
export async function quickSharpnessCheck(imageBuffer) {
  if (!imageBuffer) return { ok: false, issue: 'no-image' };

  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const variance = calculateLaplacianVariance(data, info.width, info.height);

    if (variance < 50) return { ok: false, issue: 'very-blurry', variance };
    if (variance < 150) return { ok: true, issue: 'soft', variance };
    return { ok: true, issue: null, variance };
  } catch {
    return { ok: false, issue: 'analysis-failed' };
  }
}

export default {
  analyzeSharpness,
  quickSharpnessCheck,
};
