/**
 * Default configuration for RAW Classifier
 */
export default {
  // Supported RAW file extensions
  supportedExtensions: [
    '.nef',   // Nikon
    '.cr2',   // Canon
    '.cr3',   // Canon (newer)
    '.arw',   // Sony
    '.orf',   // Olympus
    '.rw2',   // Panasonic
    '.raf',   // Fujifilm
    '.dng',   // Adobe DNG
    '.raw',   // Generic
    '.pef',   // Pentax
    '.srw',   // Samsung
  ],

  // Also support common image formats
  imageExtensions: [
    '.jpg',
    '.jpeg',
    '.png',
    '.tiff',
    '.tif',
  ],

  // Scoring weights (must sum to 1.0)
  weights: {
    landscape: {
      sharpness: 0.20,
      exposure: 0.25,
      composition: 0.25,
      dynamicRange: 0.15,
      horizonLevel: 0.10,
      noise: 0.05,
    },
    general: {
      sharpness: 0.25,
      focusAccuracy: 0.15,
      exposure: 0.25,
      composition: 0.15,
      noise: 0.10,
      dynamicRange: 0.10,
    },
  },

  // Classification thresholds (photographer-friendly)
  thresholds: {
    select: 72,      // 5 stars - top tier
    good: 58,        // 4 stars - solid keepers
    review: 45,      // 3 stars - worth looking at
    maybe: 30,       // 2 stars - borderline
    reject: 0,       // 1 star (below maybe - truly bad)
  },

  // Auto-reject conditions (more lenient - only reject truly bad shots)
  autoReject: {
    motionBlurSeverity: 0.85,   // 0-1 scale - only severe blur
    defocusSeverity: 0.85,      // Only severely out of focus
    highlightClip: 25,          // More than 25% blown
    shadowClip: 25,             // More than 25% crushed
  },

  // Session detection
  session: {
    gapMinutes: 30,             // Minutes gap = new session
  },

  // Burst detection
  burst: {
    maxIntervalSeconds: 1,      // Shots within 1s = burst
    minBurstSize: 3,            // Minimum shots to be a burst
  },

  // Output folder names
  folders: {
    select: 'selects',
    good: 'good',
    review: 'review',
    maybe: 'maybe',
    reject: 'reject',
  },

  // Report settings
  report: {
    generateHtml: true,
    generateJson: true,
    thumbnailSize: 300,
  },

  // Performance
  performance: {
    concurrency: 4,             // Parallel file processing
    extractPreviews: true,      // Extract embedded JPEGs from RAW
  },
};
