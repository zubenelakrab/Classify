/**
 * Statistics Display Module
 * Format and display search statistics in terminal
 */
import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';

/**
 * Display full statistics report
 */
export function displayStats(stats, options = {}) {
  const { verbose = false, compact = false } = options;

  console.log();
  console.log(boxen(chalk.bold.cyan(' 📊 Directory Statistics '), {
    padding: 0,
    borderStyle: 'round',
    borderColor: 'cyan',
  }));
  console.log();

  // Total files
  console.log(chalk.bold(`Total Files: ${chalk.green(stats.totalFiles)}`));
  console.log();

  // ISO Statistics
  if (stats.iso) {
    displayIsoStats(stats.iso, compact);
  }

  // Aperture Statistics
  if (stats.aperture) {
    displayApertureStats(stats.aperture, compact);
  }

  // Shutter Statistics
  if (stats.shutter) {
    displayShutterStats(stats.shutter);
  }

  // Focal Length Statistics
  if (stats.focalLength) {
    displayFocalStats(stats.focalLength, compact);
  }

  // Equipment
  if (stats.cameras?.length > 0) {
    displayEquipmentStats(stats.cameras, stats.lenses, verbose);
  }

  // Date Range
  if (stats.dateRange) {
    displayDateStats(stats.dateRange, verbose);
  }

  // Orientation
  if (stats.orientation) {
    displayOrientationStats(stats.orientation);
  }

  // Flash
  if (stats.flash && (stats.flash.fired > 0 || stats.flash.notFired > 0)) {
    displayFlashStats(stats.flash);
  }
}

/**
 * Display ISO statistics
 */
function displayIsoStats(iso, compact) {
  console.log(chalk.bold.yellow('📷 ISO Statistics'));

  const table = new Table({
    head: [chalk.cyan('Min'), chalk.cyan('Max'), chalk.cyan('Average'), chalk.cyan('Median')],
    style: { head: [], border: ['gray'] },
  });

  table.push([
    chalk.green(iso.min),
    chalk.red(iso.max),
    chalk.white(iso.average),
    chalk.white(iso.median),
  ]);

  console.log(table.toString());

  if (!compact && iso.distribution) {
    displayDistribution('ISO Distribution', iso.distribution, getIsoColor);
  }

  console.log();
}

/**
 * Display aperture statistics
 */
function displayApertureStats(aperture, compact) {
  console.log(chalk.bold.yellow('🔘 Aperture Statistics'));

  const table = new Table({
    head: [chalk.cyan('Min (widest)'), chalk.cyan('Max (narrowest)'), chalk.cyan('Average'), chalk.cyan('Median')],
    style: { head: [], border: ['gray'] },
  });

  table.push([
    chalk.green(`f/${aperture.min}`),
    chalk.white(`f/${aperture.max}`),
    chalk.white(`f/${aperture.average}`),
    chalk.white(`f/${aperture.median}`),
  ]);

  console.log(table.toString());

  if (!compact && aperture.distribution) {
    displayDistribution('Aperture Distribution', aperture.distribution, getApertureColor);
  }

  console.log();
}

/**
 * Display shutter statistics
 */
function displayShutterStats(shutter) {
  console.log(chalk.bold.yellow('⏱️  Shutter Speed Range'));

  const table = new Table({
    head: [chalk.cyan('Fastest'), chalk.cyan('Slowest')],
    style: { head: [], border: ['gray'] },
  });

  table.push([
    chalk.green(shutter.minFormatted),
    chalk.yellow(shutter.maxFormatted),
  ]);

  console.log(table.toString());
  console.log();
}

/**
 * Display focal length statistics
 */
function displayFocalStats(focal, compact) {
  console.log(chalk.bold.yellow('🔭 Focal Length Statistics'));

  const table = new Table({
    head: [chalk.cyan('Min'), chalk.cyan('Max'), chalk.cyan('Average'), chalk.cyan('Median')],
    style: { head: [], border: ['gray'] },
  });

  table.push([
    chalk.white(`${focal.min}mm`),
    chalk.white(`${focal.max}mm`),
    chalk.white(`${focal.average}mm`),
    chalk.white(`${focal.median}mm`),
  ]);

  console.log(table.toString());

  if (!compact && focal.distribution) {
    displayDistribution('Focal Length Distribution', focal.distribution, getFocalColor);
  }

  console.log();
}

/**
 * Display equipment statistics
 */
function displayEquipmentStats(cameras, lenses, verbose) {
  console.log(chalk.bold.yellow('📸 Equipment Used'));

  // Cameras
  const cameraTable = new Table({
    head: [chalk.cyan('Camera'), chalk.cyan('Count'), chalk.cyan('%')],
    style: { head: [], border: ['gray'] },
  });

  const camerasToShow = verbose ? cameras : cameras.slice(0, 5);
  for (const cam of camerasToShow) {
    cameraTable.push([cam.model, cam.count, `${cam.percentage}%`]);
  }

  console.log(cameraTable.toString());

  // Lenses
  if (lenses?.length > 0) {
    console.log();
    const lensTable = new Table({
      head: [chalk.cyan('Lens'), chalk.cyan('Count'), chalk.cyan('%')],
      style: { head: [], border: ['gray'] },
    });

    const lensesToShow = verbose ? lenses : lenses.slice(0, 5);
    for (const lens of lensesToShow) {
      lensTable.push([truncate(lens.model, 40), lens.count, `${lens.percentage}%`]);
    }

    console.log(lensTable.toString());
  }

  console.log();
}

/**
 * Display date statistics
 */
function displayDateStats(dateRange, verbose) {
  console.log(chalk.bold.yellow('📅 Date Range'));

  console.log(`  From: ${chalk.cyan(dateRange.from)}`);
  console.log(`  To:   ${chalk.cyan(dateRange.to)}`);

  if (verbose && dateRange.shotsByDate?.length > 0) {
    console.log();
    console.log(chalk.dim('  Shots by Date:'));

    // Show as mini bar chart
    const maxCount = Math.max(...dateRange.shotsByDate.map(d => d.count));
    const barWidth = 30;

    for (const { date, count } of dateRange.shotsByDate.slice(-10)) { // Last 10 days
      const barLength = Math.round((count / maxCount) * barWidth);
      const bar = '█'.repeat(barLength) + '░'.repeat(barWidth - barLength);
      console.log(`  ${chalk.dim(date)} ${chalk.green(bar)} ${count}`);
    }
  }

  console.log();
}

/**
 * Display orientation statistics
 */
function displayOrientationStats(orientation) {
  const total = orientation.landscape + orientation.portrait + orientation.square;
  if (total === 0) return;

  console.log(chalk.bold.yellow('🖼️  Orientation'));

  const table = new Table({
    head: [chalk.cyan('Landscape'), chalk.cyan('Portrait'), chalk.cyan('Square')],
    style: { head: [], border: ['gray'] },
  });

  table.push([
    `${orientation.landscape} (${Math.round(orientation.landscape / total * 100)}%)`,
    `${orientation.portrait} (${Math.round(orientation.portrait / total * 100)}%)`,
    `${orientation.square} (${Math.round(orientation.square / total * 100)}%)`,
  ]);

  console.log(table.toString());
  console.log();
}

/**
 * Display flash statistics
 */
function displayFlashStats(flash) {
  const total = flash.fired + flash.notFired;
  if (total === 0) return;

  console.log(chalk.bold.yellow('⚡ Flash Usage'));
  console.log(`  Fired: ${chalk.yellow(flash.fired)} (${Math.round(flash.fired / total * 100)}%)`);
  console.log(`  Not Fired: ${chalk.dim(flash.notFired)} (${Math.round(flash.notFired / total * 100)}%)`);
  console.log();
}

/**
 * Display distribution as horizontal bar chart
 */
function displayDistribution(title, distribution, colorFn) {
  const entries = Object.entries(distribution);
  if (entries.length === 0) return;

  console.log(chalk.dim(`  ${title}:`));

  const maxCount = Math.max(...entries.map(([, count]) => count));
  const maxLabel = Math.max(...entries.map(([label]) => label.length));
  const barWidth = 25;

  for (const [label, count] of entries) {
    const barLength = Math.round((count / maxCount) * barWidth);
    const bar = '█'.repeat(barLength);
    const color = colorFn ? colorFn(label) : chalk.blue;
    console.log(`  ${label.padEnd(maxLabel)} ${color(bar)} ${chalk.dim(count)}`);
  }
}

/**
 * Get color for ISO bucket
 */
function getIsoColor(bucket) {
  if (bucket === '≤200') return chalk.green;
  if (bucket === '201-400') return chalk.greenBright;
  if (bucket === '401-800') return chalk.yellow;
  if (bucket === '801-1600') return chalk.yellowBright;
  if (bucket === '1601-3200') return chalk.red;
  return chalk.redBright;
}

/**
 * Get color for aperture bucket
 */
function getApertureColor(bucket) {
  if (bucket.includes('1.0-2.0')) return chalk.cyan;
  if (bucket.includes('2.1-4.0')) return chalk.blue;
  if (bucket.includes('4.1-8.0')) return chalk.green;
  if (bucket.includes('8.1-16')) return chalk.yellow;
  return chalk.red;
}

/**
 * Get color for focal length bucket
 */
function getFocalColor(bucket) {
  if (bucket.includes('Ultra-wide')) return chalk.magenta;
  if (bucket.includes('Wide')) return chalk.cyan;
  if (bucket.includes('Normal')) return chalk.green;
  if (bucket.includes('Short Tele')) return chalk.yellow;
  if (bucket.includes('Tele (')) return chalk.red;
  return chalk.redBright;
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Display search results
 */
export function displaySearchResults(results, options = {}) {
  const { showExif = false, limit = 50 } = options;

  console.log();
  console.log(chalk.bold(`Found ${chalk.green(results.matched)} matching files out of ${results.total} total`));
  console.log();

  if (results.matched === 0) {
    console.log(chalk.yellow('No files matched your filters.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Filename'),
      chalk.cyan('ISO'),
      chalk.cyan('Aperture'),
      chalk.cyan('Shutter'),
      chalk.cyan('Focal'),
    ],
    style: { head: [], border: ['gray'] },
    colWidths: [5, 35, 8, 10, 12, 8],
  });

  const displayResults = results.results.slice(0, limit);

  for (let i = 0; i < displayResults.length; i++) {
    const result = displayResults[i];
    const exif = result.exif;

    table.push([
      i + 1,
      truncate(result.filename, 32),
      exif.exposure?.iso || '-',
      exif.exposure?.aperture ? `f/${exif.exposure.aperture}` : '-',
      exif.exposure?.shutterSpeed || formatShutter(exif.exposure?.shutterSpeedValue) || '-',
      exif.lens?.focalLength ? `${exif.lens.focalLength}mm` : '-',
    ]);
  }

  console.log(table.toString());

  if (results.matched > limit) {
    console.log(chalk.dim(`  ... and ${results.matched - limit} more files`));
  }

  if (showExif && displayResults.length > 0) {
    console.log();
    console.log(chalk.bold('File Paths:'));
    for (const result of displayResults) {
      console.log(chalk.dim(`  ${result.path}`));
    }
  }
}

/**
 * Format shutter speed
 */
function formatShutter(seconds) {
  if (!seconds) return '-';
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
}

/**
 * Display filter help
 */
export function displayFilterHelp(filterTypes) {
  console.log();
  console.log(chalk.bold.cyan('Available Filters:'));
  console.log();

  const table = new Table({
    head: [chalk.cyan('Filter'), chalk.cyan('Type'), chalk.cyan('Description')],
    style: { head: [], border: ['gray'] },
    colWidths: [12, 10, 50],
  });

  for (const [key, filter] of Object.entries(filterTypes)) {
    table.push([
      chalk.yellow(key),
      filter.type,
      filter.description,
    ]);
  }

  console.log(table.toString());
  console.log();
  console.log(chalk.bold('Examples:'));
  console.log(chalk.dim('  classify search ./photos --iso=100-800'));
  console.log(chalk.dim('  classify search ./photos --aperture="<2.8" --focal=">85"'));
  console.log(chalk.dim('  classify search ./photos --camera="Nikon" --date="2024-01-01:2024-12-31"'));
  console.log(chalk.dim('  classify search ./photos --orientation=portrait --iso=">1600"'));
  console.log();
}

export default {
  displayStats,
  displaySearchResults,
  displayFilterHelp,
};
