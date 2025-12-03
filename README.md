# @zubenelakrab/classify

[![npm version](https://img.shields.io/npm/v/@zubenelakrab/classify.svg)](https://www.npmjs.com/package/@zubenelakrab/classify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Photo quality analyzer and organizer for RAW files. Automatically scores, classifies, and organizes your photos based on technical quality metrics.

## Features

### Quality Analysis
- **Sharpness Detection**: Laplacian variance analysis, edge strength detection, blur type identification (motion, defocus, soft)
- **Exposure Analysis**: Histogram analysis, highlight/shadow clipping detection, dynamic range evaluation
- **Focus Accuracy**: Regional sharpness mapping, focus plane detection
- **Composition Analysis**: Rule of thirds, visual balance, horizon detection
- **Noise Estimation**: ISO-based noise prediction

### Smart Organization
- **Auto-Classification**: Categorizes images by quality score
- **Burst Detection**: Groups rapid consecutive shots and identifies the best one
- **Duplicate Detection**: Prevents copying the same photo twice
- **Undo Support**: Manifest files allow restoring original structure

### Search & Statistics
- **EXIF Search**: Find photos by ISO, aperture, shutter speed, focal length, camera, lens, date
- **Directory Statistics**: Comprehensive stats with distribution charts
- **Export Reports**: HTML, Markdown, and JSON formats

## Supported Formats

| Type | Extensions |
|------|------------|
| **RAW** | `.nef` `.cr2` `.cr3` `.arw` `.orf` `.rw2` `.raf` `.dng` `.raw` `.pef` `.srw` |
| **Images** | `.jpg` `.jpeg` `.png` `.tiff` `.tif` |

## Installation

```bash
# Install globally
npm install -g @zubenelakrab/classify

# Or use npx
npx @zubenelakrab/classify analyze ./photos
```

## Quick Start

```bash
# Analyze photos in a directory
classify analyze ./photos

# Analyze and organize into folders
classify analyze ./photos -o ./organized

# Get statistics
classify stats ./photos

# Search by EXIF data
classify search ./photos --iso=">1600" --aperture="<2.8"

# Find duplicates
classify duplicates ./photos
```

## Commands

### `analyze` - Analyze and Organize Photos

Analyzes RAW files for technical quality and optionally organizes them into folders.

```bash
# Basic analysis (display results only)
classify analyze ./photos

# Analyze and organize into folders (copies files)
classify analyze ./photos -o ./organized

# Move files instead of copying
classify analyze ./photos -o ./organized --move

# Preview without making changes
classify analyze ./photos -o ./organized --dry-run

# Scan subdirectories
classify analyze ./photos -o ./organized -r

# Landscape mode (prioritizes composition/exposure)
classify analyze ./photos -o ./organized -m landscape

# Generate HTML report
classify analyze ./photos --report ./report.html

# Output as JSON
classify analyze ./photos --json

# Skip duplicate check (faster if you know there are no duplicates)
classify analyze ./photos -o ./organized --skip-duplicates

# Adjust parallel processing
classify analyze ./photos --concurrency 8
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --recursive` | Scan subdirectories | `false` |
| `-o, --output <dir>` | Output directory for organized files | - |
| `--move` | Move files instead of copying | `false` (copy) |
| `-d, --dry-run` | Preview changes without applying | `false` |
| `-m, --mode <mode>` | Scoring mode: `general`, `landscape` | `general` |
| `--skip-organize` | Only analyze, don't organize | `false` |
| `--skip-duplicates` | Skip duplicate detection | `false` |
| `--json` | Output results as JSON | `false` |
| `--report <path>` | Generate HTML report at path | - |
| `--concurrency <n>` | Number of parallel analyses | `4` |

---

### `search` - Search Photos by EXIF Data

Find photos matching specific EXIF criteria.

```bash
# Search by ISO range
classify search ./photos --iso=100-800
classify search ./photos --iso=">1600"
classify search ./photos --iso="<400"

# Search by aperture
classify search ./photos --aperture=1.4-2.8
classify search ./photos --aperture="<4"

# Search by focal length
classify search ./photos --focal=85-200
classify search ./photos --focal=">100"

# Search by shutter speed (in seconds)
classify search ./photos --shutter="<0.001"

# Search by camera or lens (partial match)
classify search ./photos --camera="Nikon"
classify search ./photos --lens="70-200"

# Search by date
classify search ./photos --date=2024-01-15
classify search ./photos --date=2024-01-01:2024-12-31

# Search by orientation
classify search ./photos --orientation=portrait
classify search ./photos --orientation=landscape

# Search by flash
classify search ./photos --flash=true

# Combine multiple filters
classify search ./photos --iso=">1600" --aperture="<2.8" --focal=">85"

# Sort results
classify search ./photos --iso=">800" --sort=iso --desc

# Show file paths
classify search ./photos --iso=">1600" --paths

# Limit results
classify search ./photos --limit=50

# Output as JSON
classify search ./photos --iso=">1600" --json

# Show filter help
classify search ./photos --help-filters
```

#### Filter Reference

| Filter | Type | Description | Examples |
|--------|------|-------------|----------|
| `--iso` | Range | ISO sensitivity | `100`, `100-800`, `>1600`, `<400` |
| `--aperture` | Range | Aperture f-stop | `1.4`, `1.4-2.8`, `<4`, `>5.6` |
| `--shutter` | Range | Shutter speed (seconds) | `0.001`, `0.001-0.01`, `<0.0001` |
| `--focal` | Range | Focal length (mm) | `50`, `35-85`, `>100`, `<24` |
| `--camera` | Text | Camera model (partial) | `"Nikon"`, `"D850"`, `"Canon"` |
| `--lens` | Text | Lens model (partial) | `"70-200"`, `"Sigma"`, `"f/1.4"` |
| `--date` | Date | Capture date | `2024-01-15`, `2024-01-01:2024-12-31` |
| `--orientation` | Enum | Image orientation | `landscape`, `portrait`, `square` |
| `--flash` | Boolean | Flash fired | `true`, `false` |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --recursive` | Scan subdirectories | `true` |
| `--sort <field>` | Sort by: `iso`, `aperture`, `shutter`, `focal`, `date` | - |
| `--desc` | Sort descending | `false` |
| `--limit <n>` | Limit results | `100` |
| `--paths` | Show full file paths | `false` |
| `--json` | Output as JSON | `false` |
| `--help-filters` | Show filter help | - |

---

### `stats` - Directory Statistics

Display comprehensive statistics for photos in a directory.

```bash
# Basic statistics
classify stats ./photos

# Detailed statistics with date breakdown
classify stats ./photos --verbose

# Compact view (no distribution charts)
classify stats ./photos --compact

# Save to Markdown
classify stats ./photos -o report.md

# Save to HTML (visual report with charts)
classify stats ./photos -o report.html

# Save to JSON
classify stats ./photos -o report.json

# Output JSON to stdout
classify stats ./photos --json

# Non-recursive (current directory only)
classify stats ./photos --no-recursive
```

#### Statistics Displayed

- **ISO**: Min, max, average, median + distribution chart
- **Aperture**: Min (widest), max (narrowest), average, median + distribution
- **Shutter Speed**: Fastest, slowest
- **Focal Length**: Min, max, average, median + distribution by category
- **Equipment**: Cameras and lenses used with percentages
- **Date Range**: First and last capture dates + shots per day
- **Orientation**: Landscape vs portrait vs square breakdown
- **Flash Usage**: Fired vs not fired

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --recursive` | Scan subdirectories | `true` |
| `-v, --verbose` | Show detailed statistics | `false` |
| `-c, --compact` | Hide distribution charts | `false` |
| `-o, --output <file>` | Save to file (`.md`, `.html`, `.json`) | - |
| `--json` | Output JSON to stdout | `false` |

#### Export Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Markdown | `.md` | Tables and formatted text, ideal for GitHub/docs |
| HTML | `.html` | Visual report with bar charts, dark theme |
| JSON | `.json` | Raw data for programmatic use |

---

### `duplicates` - Find Duplicate Files

Detect and optionally remove duplicate photos.

```bash
# Find duplicates
classify duplicates ./photos

# Use different detection methods
classify duplicates ./photos --method=hash    # File hash only
classify duplicates ./photos --method=exif    # EXIF data only
classify duplicates ./photos --method=hybrid  # Both (default, most accurate)

# Preview what would be deleted
classify duplicates ./photos --delete

# Actually delete duplicates (will ask for confirmation)
classify duplicates ./photos --delete --no-dry-run

# Output as JSON
classify duplicates ./photos --json
```

#### Detection Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `hash` | Compares file content (first/last 64KB + size) | Exact duplicates |
| `exif` | Compares EXIF signature (camera, timestamp, settings) | Same photo, different processing |
| `hybrid` | Uses EXIF first, falls back to hash | Most accurate (default) |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --recursive` | Scan subdirectories | `true` |
| `-m, --method` | Detection: `hash`, `exif`, `hybrid` | `hybrid` |
| `--delete` | Delete duplicates (keeps oldest) | `false` |
| `-d, --dry-run` | Preview deletions | `true` |
| `--json` | Output as JSON | `false` |

---

### `info` - Single File Analysis

Display detailed analysis of a single image.

```bash
classify info ./photo.NEF
```

Shows:
- EXIF metadata (camera, lens, settings)
- Quality scores (sharpness, exposure, composition, etc.)
- Overall score and rating
- Detected issues and suggestions

---

## Output Structure

When organizing files, the following structure is created:

```
organized/
├── selects/              # Score 72+ (5 stars)
│   ├── 001_select_s85_r5.NEF
│   └── 002_select_s78_r5.NEF
├── good/                 # Score 58-71 (4 stars)
│   ├── 003_good_s67_r4.NEF
│   └── 004_good_s62_r4.NEF
├── review/               # Score 45-57 (3 stars)
│   └── 005_review_s52_r3.NEF
├── maybe/                # Score 30-44 (2 stars)
│   └── 006_maybe_s38_r2.NEF
├── reject/               # Score <30 or critical issues (1 star)
│   └── 007_reject_s22_r1.NEF
├── _manifest.json        # For undo/restore
└── _report.html          # Visual report (if --report used)
```

### Filename Format

Files are renamed with the pattern: `{sequence}_{category}_s{score}_r{rating}.{ext}`

- `sequence`: 3-digit number based on score ranking
- `category`: select, good, review, maybe, reject
- `score`: 0-100 quality score
- `rating`: 1-5 star rating

---

## Scoring System

### Score Weights by Mode

| Metric | General | Landscape |
|--------|---------|-----------|
| Sharpness | 25% | 20% |
| Exposure | 25% | 25% |
| Focus Accuracy | 15% | - |
| Composition | 15% | 25% |
| Noise | 10% | 5% |
| Dynamic Range | 10% | 15% |
| Horizon Level | - | 10% |

### Classification Thresholds

| Category | Score Range | Stars |
|----------|-------------|-------|
| Select | 72+ | ★★★★★ |
| Good | 58-71 | ★★★★☆ |
| Review | 45-57 | ★★★☆☆ |
| Maybe | 30-44 | ★★☆☆☆ |
| Reject | <30 | ★☆☆☆☆ |

### Auto-Reject Conditions

Images are automatically rejected if:
- Severe motion blur (>85% severity)
- Severely out of focus (>85% severity)
- More than 25% highlights blown
- More than 25% shadows crushed

---

## Configuration

Edit `config/default.js` to customize:

```javascript
export default {
  // Scoring weights per mode
  weights: {
    general: { sharpness: 0.25, exposure: 0.25, ... },
    landscape: { composition: 0.25, dynamicRange: 0.15, ... },
  },

  // Classification thresholds
  thresholds: {
    select: 72,
    good: 58,
    review: 45,
    maybe: 30,
  },

  // Auto-reject conditions
  autoReject: {
    motionBlurSeverity: 0.85,  // 0-1 scale
    defocusSeverity: 0.85,      // Only severe blur
    highlightClip: 25,          // More than 25% blown
    shadowClip: 25,             // More than 25% crushed
  },

  // Output folder names
  folders: {
    select: 'selects',
    good: 'good',
    review: 'review',
    maybe: 'maybe',
    reject: 'reject',
  },
};
```

---

## API Usage

```javascript
import {
  analyzeImages,
  organizeImages,
  scanDirectory
} from './src/analyzers/imageAnalyzer.js';
import { searchFiles, getDirectoryStats } from './src/search/searchEngine.js';
import { findDuplicates } from './src/utils/duplicateDetector.js';

// Analyze images
const files = await scanDirectory('./photos', { recursive: true });
const results = await analyzeImages(files, { mode: 'general' });

// Access scores
for (const result of results) {
  console.log(result.file.name, result.scoring.overall);
}

// Organize into folders
await organizeImages(results, './output', { copy: true });

// Search by EXIF
const searchResults = await searchFiles('./photos', [
  { type: 'iso', filterType: 'range', min: 100, max: 800 },
  { type: 'aperture', filterType: 'range', max: 2.8 },
]);

// Get statistics
const stats = await getDirectoryStats('./photos');
console.log(stats.stats.iso.average);

// Find duplicates
const duplicates = await findDuplicates(files, { method: 'hybrid' });
console.log(duplicates.stats.wastedSpaceFormatted);
```

---

## Requirements

- **Node.js**: 18+
- **ExifTool**: Auto-installed via `exiftool-vendored`
- **Disk Space**: Temporary space for preview extraction

---

## Troubleshooting

### Process hangs after completion
ExifTool process should close automatically. If not, the tool calls `closeExifTool()` on exit.

### "Invalid output format" error
Only `.md`, `.html`, and `.json` extensions are supported for export.

---

## License

MIT
