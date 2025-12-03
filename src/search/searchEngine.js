/**
 * Search Engine Module
 * Search RAW files by EXIF metadata filters with statistics
 */
import { promises as fs } from 'fs';
import path from 'path';
import { extractExif } from '../analyzers/exifParser.js';
import config from '../../config/default.js';

/**
 * Search filters definition
 * Fields match the structure from exifParser.js
 */
export const FILTER_TYPES = {
  iso: {
    name: 'ISO',
    type: 'range',
    field: 'exposure.iso',
    description: 'ISO sensitivity (e.g., 100-800, >1600, <400)',
  },
  aperture: {
    name: 'Aperture',
    type: 'range',
    field: 'exposure.aperture',
    description: 'Aperture f-stop (e.g., 1.4-2.8, <4, >5.6)',
  },
  shutter: {
    name: 'Shutter Speed',
    type: 'range',
    field: 'exposure.shutterSpeedValue',
    description: 'Shutter speed in seconds (e.g., 0.001-0.01, <0.0001)',
  },
  focal: {
    name: 'Focal Length',
    type: 'range',
    field: 'lens.focalLength',
    description: 'Focal length in mm (e.g., 35-85, >100, <24)',
  },
  camera: {
    name: 'Camera',
    type: 'text',
    field: 'camera.model',
    description: 'Camera model (partial match)',
  },
  lens: {
    name: 'Lens',
    type: 'text',
    field: 'lens.model',
    description: 'Lens model (partial match)',
  },
  date: {
    name: 'Date',
    type: 'date',
    field: 'timestamp.taken',
    description: 'Capture date (YYYY-MM-DD, or range YYYY-MM-DD:YYYY-MM-DD)',
  },
  width: {
    name: 'Width',
    type: 'range',
    field: 'image.width',
    description: 'Image width in pixels',
  },
  height: {
    name: 'Height',
    type: 'range',
    field: 'image.height',
    description: 'Image height in pixels',
  },
  orientation: {
    name: 'Orientation',
    type: 'enum',
    field: 'image.orientation',
    values: ['landscape', 'portrait', 'square'],
    description: 'Image orientation',
  },
  flash: {
    name: 'Flash',
    type: 'boolean',
    field: 'exposure.flash.fired',
    description: 'Flash fired (true/false)',
  },
};

/**
 * Parse a filter string into a filter object
 * Supports: exact (100), range (100-800), greater than (>100), less than (<100)
 */
export function parseFilter(filterType, value) {
  const filterDef = FILTER_TYPES[filterType];
  if (!filterDef) {
    throw new Error(`Unknown filter type: ${filterType}`);
  }

  const filter = {
    type: filterType,
    field: filterDef.field,
    filterType: filterDef.type,
  };

  switch (filterDef.type) {
    case 'range':
      if (value.includes('-') && !value.startsWith('-') && !value.startsWith('>') && !value.startsWith('<')) {
        const [min, max] = value.split('-').map(Number);
        filter.min = min;
        filter.max = max;
      } else if (value.startsWith('>')) {
        filter.min = Number(value.slice(1));
      } else if (value.startsWith('<')) {
        filter.max = Number(value.slice(1));
      } else if (value.startsWith('>=')) {
        filter.min = Number(value.slice(2));
      } else if (value.startsWith('<=')) {
        filter.max = Number(value.slice(2));
      } else {
        // Exact value
        filter.exact = Number(value);
      }
      break;

    case 'text':
      filter.pattern = value.toLowerCase();
      break;

    case 'date':
      if (value.includes(':')) {
        const [start, end] = value.split(':');
        filter.startDate = new Date(start);
        filter.endDate = new Date(end);
        filter.endDate.setHours(23, 59, 59, 999);
      } else {
        filter.startDate = new Date(value);
        filter.endDate = new Date(value);
        filter.endDate.setHours(23, 59, 59, 999);
      }
      break;

    case 'enum':
      filter.value = value.toLowerCase();
      if (!filterDef.values.includes(filter.value)) {
        throw new Error(`Invalid value for ${filterType}. Valid values: ${filterDef.values.join(', ')}`);
      }
      break;

    case 'boolean':
      filter.value = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
      break;
  }

  return filter;
}

/**
 * Get nested property value from object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Check if EXIF data matches a filter
 */
function matchesFilter(exif, filter) {
  const value = getNestedValue(exif, filter.field);

  if (value === undefined || value === null) {
    return false;
  }

  switch (filter.filterType) {
    case 'range':
      if (filter.exact !== undefined) {
        return Math.abs(value - filter.exact) < 0.001;
      }
      if (filter.min !== undefined && value < filter.min) return false;
      if (filter.max !== undefined && value > filter.max) return false;
      return true;

    case 'text':
      return String(value).toLowerCase().includes(filter.pattern);

    case 'date':
      const date = new Date(value);
      if (filter.startDate && date < filter.startDate) return false;
      if (filter.endDate && date > filter.endDate) return false;
      return true;

    case 'enum':
      // Special handling for orientation
      if (filter.field === 'image.orientation') {
        const width = exif.image?.width || 0;
        const height = exif.image?.height || 0;
        let orientation;
        if (width > height) orientation = 'landscape';
        else if (height > width) orientation = 'portrait';
        else orientation = 'square';
        return orientation === filter.value;
      }
      return String(value).toLowerCase() === filter.value;

    case 'boolean':
      return Boolean(value) === filter.value;

    default:
      return false;
  }
}

/**
 * Scan directory for supported files
 */
async function scanDirectory(dirPath, recursive = true) {
  const files = [];
  const extensions = [...config.supportedExtensions, ...config.imageExtensions];

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

/**
 * Search for files matching filters
 */
export async function searchFiles(directory, filters, options = {}) {
  const {
    recursive = true,
    limit = 0,
    sortBy = null,
    sortOrder = 'asc',
    onProgress = null,
  } = options;

  // Scan directory
  const files = await scanDirectory(directory, recursive);
  const results = [];
  const stats = createStatsCollector();

  let processed = 0;
  const total = files.length;

  for (const filePath of files) {
    try {
      // Parse EXIF
      const exif = await extractExif(filePath);

      // Collect stats for all files
      collectStats(stats, exif);

      // Check if matches all filters
      const matches = filters.every(filter => matchesFilter(exif, filter));

      if (matches) {
        results.push({
          path: filePath,
          filename: path.basename(filePath),
          exif,
        });

        if (limit > 0 && results.length >= limit) {
          break;
        }
      }

      processed++;
      if (onProgress) {
        onProgress(processed, total, filePath);
      }
    } catch (error) {
      // Skip files that can't be parsed
      processed++;
    }
  }

  // Sort results if requested
  if (sortBy) {
    const sortField = FILTER_TYPES[sortBy]?.field || sortBy;
    results.sort((a, b) => {
      const valA = getNestedValue(a.exif, sortField) || 0;
      const valB = getNestedValue(b.exif, sortField) || 0;
      const diff = valA - valB;
      return sortOrder === 'desc' ? -diff : diff;
    });
  }

  return {
    results,
    total: files.length,
    matched: results.length,
    stats: finalizeStats(stats),
  };
}

/**
 * Create statistics collector
 */
function createStatsCollector() {
  return {
    count: 0,
    iso: { min: Infinity, max: -Infinity, sum: 0, values: [] },
    aperture: { min: Infinity, max: -Infinity, sum: 0, values: [] },
    shutter: { min: Infinity, max: -Infinity, sum: 0, values: [] },
    focal: { min: Infinity, max: -Infinity, sum: 0, values: [] },
    cameras: {},
    lenses: {},
    dates: { min: null, max: null, byDate: {} },
    orientation: { landscape: 0, portrait: 0, square: 0 },
    flash: { fired: 0, notFired: 0 },
    isoDistribution: {},
    apertureDistribution: {},
    focalDistribution: {},
  };
}

/**
 * Collect statistics from EXIF data
 */
function collectStats(stats, exif) {
  stats.count++;

  // ISO stats
  if (exif.exposure?.iso) {
    const iso = exif.exposure.iso;
    stats.iso.min = Math.min(stats.iso.min, iso);
    stats.iso.max = Math.max(stats.iso.max, iso);
    stats.iso.sum += iso;
    stats.iso.values.push(iso);

    // ISO distribution buckets
    const isoBucket = iso <= 200 ? '≤200' :
                      iso <= 400 ? '201-400' :
                      iso <= 800 ? '401-800' :
                      iso <= 1600 ? '801-1600' :
                      iso <= 3200 ? '1601-3200' :
                      iso <= 6400 ? '3201-6400' : '>6400';
    stats.isoDistribution[isoBucket] = (stats.isoDistribution[isoBucket] || 0) + 1;
  }

  // Aperture stats
  if (exif.exposure?.aperture) {
    const aperture = exif.exposure.aperture;
    stats.aperture.min = Math.min(stats.aperture.min, aperture);
    stats.aperture.max = Math.max(stats.aperture.max, aperture);
    stats.aperture.sum += aperture;
    stats.aperture.values.push(aperture);

    // Aperture distribution
    const apBucket = aperture <= 2 ? 'f/1.0-2.0' :
                     aperture <= 4 ? 'f/2.1-4.0' :
                     aperture <= 8 ? 'f/4.1-8.0' :
                     aperture <= 16 ? 'f/8.1-16' : 'f/>16';
    stats.apertureDistribution[apBucket] = (stats.apertureDistribution[apBucket] || 0) + 1;
  }

  // Shutter stats - use shutterSpeedValue (numeric) not shutterSpeed (string)
  if (exif.exposure?.shutterSpeedValue && typeof exif.exposure.shutterSpeedValue === 'number') {
    const shutter = exif.exposure.shutterSpeedValue;
    stats.shutter.min = Math.min(stats.shutter.min, shutter);
    stats.shutter.max = Math.max(stats.shutter.max, shutter);
    stats.shutter.sum += shutter;
    stats.shutter.values.push(shutter);
  }

  // Focal length stats
  if (exif.lens?.focalLength) {
    const focal = exif.lens.focalLength;
    stats.focal.min = Math.min(stats.focal.min, focal);
    stats.focal.max = Math.max(stats.focal.max, focal);
    stats.focal.sum += focal;
    stats.focal.values.push(focal);

    // Focal distribution
    const focalBucket = focal <= 24 ? 'Ultra-wide (≤24mm)' :
                        focal <= 35 ? 'Wide (25-35mm)' :
                        focal <= 50 ? 'Normal (36-50mm)' :
                        focal <= 85 ? 'Short Tele (51-85mm)' :
                        focal <= 135 ? 'Tele (86-135mm)' : 'Long Tele (>135mm)';
    stats.focalDistribution[focalBucket] = (stats.focalDistribution[focalBucket] || 0) + 1;
  }

  // Camera stats
  if (exif.camera?.model) {
    const camera = exif.camera.model;
    stats.cameras[camera] = (stats.cameras[camera] || 0) + 1;
  }

  // Lens stats
  if (exif.lens?.model) {
    const lens = exif.lens.model;
    stats.lenses[lens] = (stats.lenses[lens] || 0) + 1;
  }

  // Date stats
  if (exif.timestamp?.taken) {
    const date = new Date(exif.timestamp.taken);
    if (!stats.dates.min || date < stats.dates.min) stats.dates.min = date;
    if (!stats.dates.max || date > stats.dates.max) stats.dates.max = date;

    const dateKey = date.toISOString().split('T')[0];
    stats.dates.byDate[dateKey] = (stats.dates.byDate[dateKey] || 0) + 1;
  }

  // Orientation stats
  if (exif.image?.width && exif.image?.height) {
    const { width, height } = exif.image;
    if (width > height) stats.orientation.landscape++;
    else if (height > width) stats.orientation.portrait++;
    else stats.orientation.square++;
  }

  // Flash stats
  if (exif.exposure?.flash !== undefined) {
    if (exif.exposure.flash?.fired) stats.flash.fired++;
    else stats.flash.notFired++;
  }
}

/**
 * Calculate median of sorted array
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Finalize and format statistics
 */
function finalizeStats(stats) {
  const result = {
    totalFiles: stats.count,
  };

  // ISO statistics
  if (stats.iso.values.length > 0) {
    result.iso = {
      min: stats.iso.min,
      max: stats.iso.max,
      average: Math.round(stats.iso.sum / stats.iso.values.length),
      median: Math.round(median(stats.iso.values)),
      distribution: stats.isoDistribution,
    };
  }

  // Aperture statistics
  if (stats.aperture.values.length > 0) {
    result.aperture = {
      min: Math.round(stats.aperture.min * 10) / 10,
      max: Math.round(stats.aperture.max * 10) / 10,
      average: Math.round((stats.aperture.sum / stats.aperture.values.length) * 10) / 10,
      median: Math.round(median(stats.aperture.values) * 10) / 10,
      distribution: stats.apertureDistribution,
    };
  }

  // Shutter statistics
  if (stats.shutter.values.length > 0 && stats.shutter.min !== Infinity) {
    result.shutter = {
      min: stats.shutter.min,
      max: stats.shutter.max,
      minFormatted: formatShutter(stats.shutter.min),
      maxFormatted: formatShutter(stats.shutter.max),
    };
  }

  // Focal length statistics
  if (stats.focal.values.length > 0) {
    result.focalLength = {
      min: Math.round(stats.focal.min),
      max: Math.round(stats.focal.max),
      average: Math.round(stats.focal.sum / stats.focal.values.length),
      median: Math.round(median(stats.focal.values)),
      distribution: stats.focalDistribution,
    };
  }

  // Equipment stats
  result.cameras = Object.entries(stats.cameras)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count, percentage: Math.round(count / stats.count * 100) }));

  result.lenses = Object.entries(stats.lenses)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count, percentage: Math.round(count / stats.count * 100) }));

  // Date range
  if (stats.dates.min && stats.dates.max) {
    result.dateRange = {
      from: stats.dates.min.toISOString().split('T')[0],
      to: stats.dates.max.toISOString().split('T')[0],
      shotsByDate: Object.entries(stats.dates.byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count })),
    };
  }

  // Orientation
  result.orientation = stats.orientation;

  // Flash
  result.flash = stats.flash;

  return result;
}

/**
 * Format shutter speed for display
 */
function formatShutter(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) {
    return '-';
  }
  if (seconds >= 1) {
    return `${Math.round(seconds * 10) / 10}s`;
  } else {
    const denom = Math.round(1 / seconds);
    return `1/${denom}`;
  }
}

/**
 * Get quick statistics for a directory (without filtering)
 */
export async function getDirectoryStats(directory, options = {}) {
  return searchFiles(directory, [], options);
}

export default {
  FILTER_TYPES,
  parseFilter,
  searchFiles,
  getDirectoryStats,
};
