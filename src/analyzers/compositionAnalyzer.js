/**
 * Composition Analyzer Module
 * Analyzes image composition using rule of thirds, visual balance, and more
 */
import sharp from 'sharp';

/**
 * Analyze image composition
 * @param {Buffer} imageBuffer - Image buffer to analyze
 * @returns {Promise<Object>} Composition analysis results
 */
export async function analyzeComposition(imageBuffer) {
  if (!imageBuffer) {
    return createEmptyAnalysis();
  }

  try {
    // Get image metadata and prepare for analysis
    const { data, info } = await sharp(imageBuffer)
      .resize(600, 600, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Analyze rule of thirds
    const ruleOfThirds = analyzeRuleOfThirds(data, info.width, info.height);

    // Analyze visual balance
    const balance = analyzeVisualBalance(data, info.width, info.height);

    // Analyze horizon (if present)
    const horizon = detectHorizon(data, info.width, info.height);

    // Analyze leading lines
    const leadingLines = detectLeadingLines(data, info.width, info.height);

    // Analyze visual weight distribution
    const weightDistribution = analyzeWeightDistribution(data, info.width, info.height);

    // Detect symmetry
    const symmetry = analyzeSymmetry(data, info.width, info.height);

    // Calculate overall composition score
    const score = calculateCompositionScore(ruleOfThirds, balance, horizon, symmetry);

    return {
      ruleOfThirds,
      balance,
      horizon,
      leadingLines,
      weightDistribution,
      symmetry,
      score,
      dimensions: { width: info.width, height: info.height },
    };
  } catch (error) {
    console.error('Composition analysis failed:', error.message);
    return createEmptyAnalysis();
  }
}

/**
 * Analyze rule of thirds alignment
 */
function analyzeRuleOfThirds(data, width, height) {
  // Define power points (intersections of thirds lines)
  const powerPoints = [
    { x: width / 3, y: height / 3, name: 'top-left' },
    { x: (width * 2) / 3, y: height / 3, name: 'top-right' },
    { x: width / 3, y: (height * 2) / 3, name: 'bottom-left' },
    { x: (width * 2) / 3, y: (height * 2) / 3, name: 'bottom-right' },
  ];

  // Find areas of visual interest (high contrast/detail)
  const interestPoints = findInterestPoints(data, width, height);

  // Calculate distance from interest points to power points
  let nearestPowerPoint = null;
  let minDistance = Infinity;
  let alignment = 0;

  for (const interest of interestPoints) {
    for (const power of powerPoints) {
      const dist = Math.sqrt(
        Math.pow(interest.x - power.x, 2) + Math.pow(interest.y - power.y, 2)
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestPowerPoint = power.name;
      }
    }
  }

  // Calculate alignment score (how close to power points)
  const maxDist = Math.sqrt(Math.pow(width / 6, 2) + Math.pow(height / 6, 2));
  alignment = Math.max(0, 1 - minDistance / maxDist);

  // Check thirds line alignment
  const thirdsLines = analyzeThirdsLines(interestPoints, width, height);

  return {
    alignment: Math.round(alignment * 100),
    nearestPowerPoint,
    interestPointCount: interestPoints.length,
    thirdsLines,
    assessment: alignment > 0.7 ? 'strong' : alignment > 0.4 ? 'moderate' : 'weak',
  };
}

/**
 * Find points of visual interest (high contrast areas)
 */
function findInterestPoints(data, width, height, threshold = 50) {
  const points = [];
  const blockSize = 30;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      let maxContrast = 0;
      let maxX = bx;
      let maxY = by;

      // Find highest contrast in block
      for (let y = by; y < Math.min(by + blockSize, height - 1); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width - 1); x++) {
          const idx = y * width + x;
          const contrast =
            Math.abs(data[idx] - data[idx + 1]) +
            Math.abs(data[idx] - data[idx + width]);

          if (contrast > maxContrast) {
            maxContrast = contrast;
            maxX = x;
            maxY = y;
          }
        }
      }

      if (maxContrast > threshold) {
        points.push({ x: maxX, y: maxY, strength: maxContrast });
      }
    }
  }

  // Sort by strength and return top points
  return points.sort((a, b) => b.strength - a.strength).slice(0, 10);
}

/**
 * Analyze alignment with thirds lines
 */
function analyzeThirdsLines(interestPoints, width, height) {
  const verticalLines = [width / 3, (width * 2) / 3];
  const horizontalLines = [height / 3, (height * 2) / 3];
  const tolerance = Math.min(width, height) * 0.05;

  let verticalAlignment = 0;
  let horizontalAlignment = 0;

  for (const point of interestPoints) {
    for (const line of verticalLines) {
      if (Math.abs(point.x - line) < tolerance) {
        verticalAlignment += point.strength;
      }
    }
    for (const line of horizontalLines) {
      if (Math.abs(point.y - line) < tolerance) {
        horizontalAlignment += point.strength;
      }
    }
  }

  return {
    vertical: verticalAlignment > 100,
    horizontal: horizontalAlignment > 100,
  };
}

/**
 * Analyze visual balance
 */
function analyzeVisualBalance(data, width, height) {
  // Calculate visual weight for each quadrant
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);

  const quadrants = {
    topLeft: calculateQuadrantWeight(data, width, 0, 0, midX, midY),
    topRight: calculateQuadrantWeight(data, width, midX, 0, width, midY),
    bottomLeft: calculateQuadrantWeight(data, width, 0, midY, midX, height),
    bottomRight: calculateQuadrantWeight(data, width, midX, midY, width, height),
  };

  // Calculate balance ratios
  const leftWeight = quadrants.topLeft + quadrants.bottomLeft;
  const rightWeight = quadrants.topRight + quadrants.bottomRight;
  const topWeight = quadrants.topLeft + quadrants.topRight;
  const bottomWeight = quadrants.bottomLeft + quadrants.bottomRight;

  const horizontalBalance = 1 - Math.abs(leftWeight - rightWeight) / (leftWeight + rightWeight);
  const verticalBalance = 1 - Math.abs(topWeight - bottomWeight) / (topWeight + bottomWeight);

  // Determine balance type
  let balanceType;
  if (horizontalBalance > 0.8 && verticalBalance > 0.8) {
    balanceType = 'symmetrical';
  } else if (horizontalBalance > 0.6 && verticalBalance > 0.6) {
    balanceType = 'balanced';
  } else if (horizontalBalance < 0.4 || verticalBalance < 0.4) {
    balanceType = 'dynamic';
  } else {
    balanceType = 'asymmetrical';
  }

  return {
    quadrants,
    horizontal: Math.round(horizontalBalance * 100),
    vertical: Math.round(verticalBalance * 100),
    overall: Math.round(((horizontalBalance + verticalBalance) / 2) * 100),
    type: balanceType,
  };
}

/**
 * Calculate visual weight of a quadrant
 */
function calculateQuadrantWeight(data, stride, x1, y1, x2, y2) {
  let weight = 0;
  let count = 0;

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const idx = y * stride + x;
      // Visual weight based on brightness and contrast
      weight += data[idx];
      count++;
    }
  }

  return count > 0 ? weight / count : 0;
}

/**
 * Detect horizon line
 */
function detectHorizon(data, width, height) {
  // Look for strong horizontal edges
  const edgeStrengths = [];

  // Scan horizontal lines
  for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y++) {
    let edgeSum = 0;

    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      // Vertical gradient
      if (y > 0 && y < height - 1) {
        const gradient = Math.abs(data[idx - width] - data[idx + width]);
        edgeSum += gradient;
      }
    }

    edgeStrengths.push({ y, strength: edgeSum / width });
  }

  // Find strongest horizontal edge
  const sorted = edgeStrengths.sort((a, b) => b.strength - a.strength);

  if (sorted.length === 0 || sorted[0].strength < 10) {
    return {
      detected: false,
      position: null,
      level: null,
      tilt: null,
    };
  }

  const horizonY = sorted[0].y;
  const positionRatio = horizonY / height;

  // Detect tilt by comparing left and right edge positions
  const tilt = detectHorizonTilt(data, width, height, horizonY);

  // Determine if it's a good horizon position
  let positionQuality;
  if (positionRatio > 0.3 && positionRatio < 0.4) {
    positionQuality = 'upper-third'; // Good for landscapes
  } else if (positionRatio > 0.6 && positionRatio < 0.7) {
    positionQuality = 'lower-third'; // Good for sky emphasis
  } else if (positionRatio > 0.45 && positionRatio < 0.55) {
    positionQuality = 'centered'; // Can be boring
  } else {
    positionQuality = 'off-center';
  }

  return {
    detected: true,
    position: Math.round(positionRatio * 100),
    positionQuality,
    level: Math.abs(tilt) < 1,
    tilt: Math.round(tilt * 10) / 10,
    strength: Math.round(sorted[0].strength),
  };
}

/**
 * Detect horizon tilt angle
 */
function detectHorizonTilt(data, width, height, approximateY) {
  // Sample points along the horizon
  const samples = [];
  const sampleCount = 10;
  const searchRange = 20;

  for (let i = 0; i < sampleCount; i++) {
    const x = Math.floor((i + 0.5) * (width / sampleCount));
    let maxGradient = 0;
    let bestY = approximateY;

    // Search for strongest edge near approximate position
    for (let dy = -searchRange; dy <= searchRange; dy++) {
      const y = approximateY + dy;
      if (y < 1 || y >= height - 1) continue;

      const idx = y * width + x;
      const gradient = Math.abs(data[idx - width] - data[idx + width]);

      if (gradient > maxGradient) {
        maxGradient = gradient;
        bestY = y;
      }
    }

    samples.push({ x, y: bestY });
  }

  // Linear regression to find tilt
  const n = samples.length;
  const sumX = samples.reduce((s, p) => s + p.x, 0);
  const sumY = samples.reduce((s, p) => s + p.y, 0);
  const sumXY = samples.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = samples.reduce((s, p) => s + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const tiltDegrees = Math.atan(slope) * (180 / Math.PI);

  return tiltDegrees;
}

/**
 * Detect leading lines
 */
function detectLeadingLines(data, width, height) {
  // Simplified leading line detection using gradient direction analysis
  const directions = {
    toCenter: 0,
    horizontal: 0,
    vertical: 0,
    diagonal: 0,
  };

  const centerX = width / 2;
  const centerY = height / 2;

  // Sample gradients across the image
  for (let y = 10; y < height - 10; y += 20) {
    for (let x = 10; x < width - 10; x += 20) {
      const idx = y * width + x;

      // Calculate gradient direction
      const gx = data[idx + 1] - data[idx - 1];
      const gy = data[idx + width] - data[idx - width];
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude > 20) {
        const angle = Math.atan2(gy, gx) * (180 / Math.PI);

        // Check if gradient points toward center
        const towardsCenterAngle = Math.atan2(centerY - y, centerX - x) * (180 / Math.PI);
        const angleDiff = Math.abs(angle - towardsCenterAngle);

        if (angleDiff < 30 || angleDiff > 150) {
          directions.toCenter += magnitude;
        }

        if (Math.abs(angle) < 20 || Math.abs(angle) > 160) {
          directions.horizontal += magnitude;
        } else if (Math.abs(angle - 90) < 20 || Math.abs(angle + 90) < 20) {
          directions.vertical += magnitude;
        } else {
          directions.diagonal += magnitude;
        }
      }
    }
  }

  // Normalize
  const total = directions.toCenter + directions.horizontal + directions.vertical + directions.diagonal || 1;
  const normalized = {
    toCenter: Math.round((directions.toCenter / total) * 100),
    horizontal: Math.round((directions.horizontal / total) * 100),
    vertical: Math.round((directions.vertical / total) * 100),
    diagonal: Math.round((directions.diagonal / total) * 100),
  };

  // Find dominant direction
  const dominant = Object.entries(normalized).reduce((a, b) => (b[1] > a[1] ? b : a));

  return {
    detected: directions.toCenter > total * 0.3 || dominant[1] > 40,
    dominant: dominant[0],
    strength: dominant[1],
    distribution: normalized,
    leadToSubject: directions.toCenter > total * 0.3,
  };
}

/**
 * Analyze weight distribution
 */
function analyzeWeightDistribution(data, width, height) {
  // Calculate center of visual mass
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const weight = data[y * width + x];
      sumX += x * weight;
      sumY += y * weight;
      totalWeight += weight;
    }
  }

  const centerOfMass = {
    x: sumX / totalWeight / width,
    y: sumY / totalWeight / height,
  };

  // Determine if center of mass is well-positioned
  const offsetX = Math.abs(centerOfMass.x - 0.5);
  const offsetY = Math.abs(centerOfMass.y - 0.5);

  return {
    centerOfMass: {
      x: Math.round(centerOfMass.x * 100),
      y: Math.round(centerOfMass.y * 100),
    },
    offset: {
      x: Math.round(offsetX * 100),
      y: Math.round(offsetY * 100),
    },
    centered: offsetX < 0.1 && offsetY < 0.1,
  };
}

/**
 * Analyze image symmetry
 */
function analyzeSymmetry(data, width, height) {
  let horizontalDiff = 0;
  let verticalDiff = 0;
  let count = 0;

  // Horizontal symmetry (left vs right)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width / 2; x++) {
      const left = data[y * width + x];
      const right = data[y * width + (width - 1 - x)];
      horizontalDiff += Math.abs(left - right);
      count++;
    }
  }

  // Vertical symmetry (top vs bottom)
  let vCount = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const top = data[y * width + x];
      const bottom = data[(height - 1 - y) * width + x];
      verticalDiff += Math.abs(top - bottom);
      vCount++;
    }
  }

  const horizontalSymmetry = 1 - horizontalDiff / (count * 255);
  const verticalSymmetry = 1 - verticalDiff / (vCount * 255);

  return {
    horizontal: Math.round(horizontalSymmetry * 100),
    vertical: Math.round(verticalSymmetry * 100),
    overall: Math.round(((horizontalSymmetry + verticalSymmetry) / 2) * 100),
    type: horizontalSymmetry > 0.8 ? 'horizontally-symmetric' :
          verticalSymmetry > 0.8 ? 'vertically-symmetric' :
          horizontalSymmetry > 0.6 && verticalSymmetry > 0.6 ? 'balanced' : 'asymmetric',
  };
}

/**
 * Calculate overall composition score
 * More generous - composition is subjective, don't penalize too much
 */
function calculateCompositionScore(ruleOfThirds, balance, horizon, symmetry) {
  let score = 65; // Start above average - most photos have acceptable composition
  const factors = [];

  // Rule of thirds contribution
  if (ruleOfThirds.alignment > 60) {
    score += 15;
    factors.push('strong-thirds: +15');
  } else if (ruleOfThirds.alignment > 30) {
    score += 8;
    factors.push('moderate-thirds: +8');
  }

  // Balance contribution
  if (balance.type === 'balanced' || balance.type === 'symmetrical') {
    score += 8;
    factors.push('balanced: +8');
  } else if (balance.type === 'dynamic') {
    score += 5;
    factors.push('dynamic-balance: +5');
  }

  // Horizon contribution - only penalize severe tilt
  if (horizon.detected) {
    if (!horizon.level && Math.abs(horizon.tilt) > 4) {
      score -= 8;
      factors.push('tilted-horizon: -8');
    }
    if (horizon.positionQuality === 'upper-third' || horizon.positionQuality === 'lower-third') {
      score += 5;
      factors.push('horizon-on-third: +5');
    }
    // Don't penalize centered horizon - can be intentional
  }

  // Symmetry bonus
  if (symmetry.type === 'horizontally-symmetric') {
    score += 5;
    factors.push('symmetric: +5');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    factors,
    assessment: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 45 ? 'average' : 'weak',
  };
}

/**
 * Create empty analysis result
 */
function createEmptyAnalysis() {
  return {
    ruleOfThirds: { alignment: 0, assessment: 'unknown' },
    balance: { overall: 0, type: 'unknown' },
    horizon: { detected: false },
    leadingLines: { detected: false },
    weightDistribution: { centered: false },
    symmetry: { overall: 0, type: 'unknown' },
    score: { score: 0, assessment: 'unknown' },
  };
}

export default {
  analyzeComposition,
};
