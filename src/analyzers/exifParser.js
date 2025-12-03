/**
 * EXIF Parser Module
 * Extracts and normalizes metadata from RAW and image files
 */
import { exiftool } from 'exiftool-vendored';

/**
 * Extract comprehensive EXIF data from an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<Object>} Normalized EXIF data
 */
export async function extractExif(filePath) {
  try {
    const tags = await exiftool.read(filePath);
    return normalizeExifData(tags, filePath);
  } catch (error) {
    console.error(`Error reading EXIF from ${filePath}:`, error.message);
    return createEmptyExifData(filePath);
  }
}

/**
 * Normalize EXIF data into a consistent format
 */
function normalizeExifData(tags, filePath) {
  return {
    // File info
    file: {
      path: filePath,
      name: tags.FileName || '',
      size: tags.FileSize || 0,
      type: tags.FileType || '',
      mimeType: tags.MIMEType || '',
    },

    // Camera info
    camera: {
      make: tags.Make || 'Unknown',
      model: tags.Model || 'Unknown',
      serial: tags.SerialNumber || null,
    },

    // Lens info
    lens: {
      model: tags.LensModel || tags.Lens || tags.LensID || 'Unknown',
      focalLength: parseFocalLength(tags.FocalLength),
      focalLength35mm: tags.FocalLengthIn35mmFormat || null,
      maxAperture: tags.MaxApertureValue || null,
    },

    // Exposure settings
    exposure: {
      aperture: parseAperture(tags.FNumber || tags.Aperture),
      shutterSpeed: parseShutterSpeed(tags.ExposureTime || tags.ShutterSpeed),
      shutterSpeedValue: parseShutterSpeedValue(tags.ExposureTime || tags.ShutterSpeed),
      iso: tags.ISO || tags.ISOSpeedRatings || null,
      exposureCompensation: tags.ExposureCompensation || 0,
      exposureMode: tags.ExposureMode || tags.ExposureProgram || null,
      meteringMode: tags.MeteringMode || null,
      flash: parseFlash(tags.Flash),
    },

    // Focus info
    focus: {
      mode: tags.FocusMode || tags.AFMode || null,
      point: tags.AFPoint || tags.AFAreaMode || null,
      distance: tags.FocusDistance || tags.SubjectDistance || null,
      continuous: isContinuousFocus(tags),
    },

    // Image properties
    image: {
      width: tags.ImageWidth || tags.ExifImageWidth || null,
      height: tags.ImageHeight || tags.ExifImageHeight || null,
      orientation: tags.Orientation || 1,
      colorSpace: tags.ColorSpace || null,
      bitDepth: tags.BitsPerSample || tags.ColorBitDepth || null,
      whiteBalance: tags.WhiteBalance || null,
      colorTemperature: tags.ColorTemperature || null,
    },

    // Timestamp
    timestamp: {
      taken: parseDate(tags.DateTimeOriginal || tags.CreateDate),
      modified: parseDate(tags.ModifyDate),
      timezone: tags.OffsetTimeOriginal || null,
    },

    // GPS (if available)
    gps: extractGPS(tags),

    // Shooting conditions
    shooting: {
      driveMode: tags.DriveMode || tags.ContinuousDrive || 'Single',
      burstMode: isBurstMode(tags),
      selfTimer: tags.SelfTimer || null,
      bracketing: detectBracketing(tags),
    },

    // Quality indicators from camera
    quality: {
      imageQuality: tags.Quality || tags.ImageQuality || null,
      rawCompression: tags.Compression || null,
      noiseReduction: tags.NoiseReduction || null,
    },

    // Raw tags for debugging/advanced use
    _raw: tags,
  };
}

/**
 * Parse focal length to number
 */
function parseFocalLength(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse aperture to f-number
 */
function parseAperture(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse shutter speed to human-readable format
 */
function parseShutterSpeed(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value < 1) {
      const denominator = Math.round(1 / value);
      return `1/${denominator}`;
    }
    return `${value}s`;
  }
  return String(value);
}

/**
 * Parse shutter speed to numeric value (in seconds)
 */
function parseShutterSpeedValue(value) {
  if (!value) return null;

  // Already a number
  if (typeof value === 'number') {
    return value;
  }

  const str = String(value);

  // Format: "1/250" or "1/250s"
  const fractionMatch = str.match(/^1\/(\d+)/);
  if (fractionMatch) {
    return 1 / parseInt(fractionMatch[1], 10);
  }

  // Format: "0.5" or "0.5s" or "2s"
  const decimalMatch = str.match(/^([\d.]+)/);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  return null;
}

/**
 * Parse flash info
 */
function parseFlash(value) {
  if (!value) return { fired: false, mode: null };

  const flashStr = String(value).toLowerCase();
  return {
    fired: flashStr.includes('fired') || flashStr.includes('on'),
    mode: value,
  };
}

/**
 * Check if continuous focus was used
 */
function isContinuousFocus(tags) {
  const focusMode = String(tags.FocusMode || tags.AFMode || '').toLowerCase();
  return focusMode.includes('continuous') ||
         focusMode.includes('af-c') ||
         focusMode.includes('ai servo');
}

/**
 * Parse date string to Date object
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  try {
    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const normalized = String(value).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    return new Date(normalized);
  } catch {
    return null;
  }
}

/**
 * Extract GPS coordinates
 */
function extractGPS(tags) {
  if (!tags.GPSLatitude || !tags.GPSLongitude) {
    return null;
  }

  return {
    latitude: tags.GPSLatitude,
    longitude: tags.GPSLongitude,
    altitude: tags.GPSAltitude || null,
  };
}

/**
 * Check if burst/continuous mode was used
 */
function isBurstMode(tags) {
  const driveMode = String(tags.DriveMode || tags.ContinuousDrive || '').toLowerCase();
  return driveMode.includes('continuous') ||
         driveMode.includes('burst') ||
         driveMode.includes('high speed');
}

/**
 * Detect bracketing (exposure, focus, etc.)
 */
function detectBracketing(tags) {
  const bracketing = {
    enabled: false,
    type: null,
    sequence: null,
  };

  if (tags.BracketMode || tags.AEBracketMode) {
    bracketing.enabled = true;
    bracketing.type = 'exposure';
  }

  if (tags.FocusBracketMode) {
    bracketing.enabled = true;
    bracketing.type = 'focus';
  }

  if (tags.BracketShotNumber) {
    bracketing.sequence = tags.BracketShotNumber;
  }

  return bracketing;
}

/**
 * Create empty EXIF data structure for files that fail to parse
 */
function createEmptyExifData(filePath) {
  return {
    file: { path: filePath, name: '', size: 0, type: '', mimeType: '' },
    camera: { make: 'Unknown', model: 'Unknown', serial: null },
    lens: { model: 'Unknown', focalLength: null, focalLength35mm: null, maxAperture: null },
    exposure: { aperture: null, shutterSpeed: null, shutterSpeedValue: null, iso: null, exposureCompensation: 0, exposureMode: null, meteringMode: null, flash: { fired: false, mode: null } },
    focus: { mode: null, point: null, distance: null, continuous: false },
    image: { width: null, height: null, orientation: 1, colorSpace: null, bitDepth: null, whiteBalance: null, colorTemperature: null },
    timestamp: { taken: null, modified: null, timezone: null },
    gps: null,
    shooting: { driveMode: 'Single', burstMode: false, selfTimer: null, bracketing: { enabled: false, type: null, sequence: null } },
    quality: { imageQuality: null, rawCompression: null, noiseReduction: null },
    _raw: {},
  };
}

/**
 * Batch extract EXIF from multiple files
 */
export async function extractExifBatch(filePaths) {
  const results = await Promise.all(
    filePaths.map(fp => extractExif(fp))
  );
  return results;
}

/**
 * Close exiftool process (call on application exit)
 */
export async function closeExifTool() {
  await exiftool.end();
}

export default {
  extractExif,
  extractExifBatch,
  closeExifTool,
};
