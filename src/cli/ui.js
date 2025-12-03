/**
 * CLI UI Components
 * Beautiful terminal output for the classifier
 */
import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import figures from 'figures';

// Color scheme
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  highlight: chalk.white.bold,
  score: {
    excellent: chalk.green.bold,
    good: chalk.cyan,
    average: chalk.yellow,
    poor: chalk.red,
  },
};

// Star rating display
const stars = {
  5: chalk.yellow('★★★★★'),
  4: chalk.yellow('★★★★') + chalk.gray('☆'),
  3: chalk.yellow('★★★') + chalk.gray('☆☆'),
  2: chalk.yellow('★★') + chalk.gray('☆☆☆'),
  1: chalk.yellow('★') + chalk.gray('☆☆☆☆'),
};

/**
 * Display application banner
 */
export function showBanner() {
  const banner = `
${chalk.cyan.bold('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║')}  ${chalk.white.bold('RAW CLASSIFIER')} ${chalk.gray('- Photo Quality Analyzer')}                 ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}  ${chalk.gray('Automatic scoring, culling & organization for RAW files')}  ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚═══════════════════════════════════════════════════════════╝')}
`;
  console.log(banner);
}

/**
 * Format score with color
 */
export function formatScore(score) {
  if (score >= 90) return colors.score.excellent(score);
  if (score >= 75) return colors.score.good(score);
  if (score >= 60) return colors.score.average(score);
  return colors.score.poor(score);
}

/**
 * Format category with icon
 */
export function formatCategory(category) {
  const icons = {
    select: chalk.green(figures.star),
    good: chalk.cyan(figures.tick),
    review: chalk.yellow(figures.info),
    maybe: chalk.gray(figures.ellipsis),
    reject: chalk.red(figures.cross),
  };

  return `${icons[category] || ''} ${category}`;
}

/**
 * Display single image analysis result
 */
export function showImageResult(analysis) {
  if (!analysis.success) {
    console.log(chalk.red(`${figures.cross} ${analysis.file?.name || 'Unknown'}: ${analysis.error}`));
    return;
  }

  const { file, scoring } = analysis;

  const box = boxen(
    `${chalk.white.bold(file.name)}

${chalk.gray('Score:')} ${formatScore(scoring.overall)}  ${stars[scoring.rating]}
${chalk.gray('Category:')} ${formatCategory(scoring.classification.category)}

${chalk.gray('Breakdown:')}
  Sharpness:    ${formatScore(scoring.scores.sharpness || 0)}
  Exposure:     ${formatScore(scoring.scores.exposure || 0)}
  Focus:        ${formatScore(scoring.scores.focusAccuracy || 0)}
  Composition:  ${formatScore(scoring.scores.composition || 0)}

${scoring.issues.length > 0 ? chalk.yellow('Issues:') : chalk.green('No issues detected')}
${scoring.issues.map(i => `  ${i.severity === 'high' ? chalk.red(figures.warning) : chalk.yellow(figures.info)} ${i.message}`).join('\n')}
`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: scoring.overall >= 75 ? 'green' : scoring.overall >= 50 ? 'yellow' : 'red',
    }
  );

  console.log(box);
}

/**
 * Create progress bar
 */
export function progressBar(current, total, width = 30) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = colors.primary('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `${bar} ${percent}% (${current}/${total})`;
}

/**
 * Display analysis summary table
 */
export function showSummaryTable(results) {
  const table = new Table({
    head: [
      chalk.white.bold('File'),
      chalk.white.bold('Score'),
      chalk.white.bold('Rating'),
      chalk.white.bold('Category'),
      chalk.white.bold('Issues'),
    ],
    colWidths: [30, 8, 12, 12, 15],
    style: {
      head: [],
      border: ['gray'],
    },
  });

  const successful = results.filter(r => r.success);

  // Sort by score descending
  successful.sort((a, b) => (b.scoring?.overall || 0) - (a.scoring?.overall || 0));

  for (const result of successful.slice(0, 20)) { // Show top 20
    const { file, scoring } = result;

    table.push([
      truncate(file.name, 28),
      formatScore(scoring.overall),
      stars[scoring.rating],
      formatCategory(scoring.classification.category),
      scoring.issues.length > 0 ? chalk.yellow(scoring.issues.length) : chalk.green('0'),
    ]);
  }

  if (successful.length > 20) {
    table.push([
      chalk.gray(`... and ${successful.length - 20} more`),
      '', '', '', '',
    ]);
  }

  console.log(table.toString());
}

/**
 * Display statistics summary
 */
export function showStatistics(results) {
  const successful = results.filter(r => r.success);
  const scores = successful.map(r => r.scoring?.overall || 0);

  const stats = {
    total: results.length,
    analyzed: successful.length,
    failed: results.length - successful.length,
    avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
  };

  // Count by category
  const byCategory = {};
  for (const result of successful) {
    const cat = result.scoring?.classification?.category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // Count by rating
  const byRating = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const result of successful) {
    const rating = result.scoring?.rating || 1;
    byRating[rating]++;
  }

  const statsBox = boxen(
    `${chalk.white.bold('Analysis Statistics')}

${chalk.gray('Total Files:')}     ${stats.total}
${chalk.gray('Analyzed:')}        ${chalk.green(stats.analyzed)}
${chalk.gray('Failed:')}          ${stats.failed > 0 ? chalk.red(stats.failed) : chalk.green(0)}

${chalk.white.bold('Scores')}
${chalk.gray('Average:')}         ${formatScore(stats.avgScore)}
${chalk.gray('Range:')}           ${formatScore(stats.minScore)} - ${formatScore(stats.maxScore)}

${chalk.white.bold('By Category')}
${chalk.green(figures.star)} Selects:       ${byCategory.select || 0}
${chalk.cyan(figures.tick)} Good:          ${byCategory.good || 0}
${chalk.yellow(figures.info)} Review:        ${byCategory.review || 0}
${chalk.gray(figures.ellipsis)} Maybe:         ${byCategory.maybe || 0}
${chalk.red(figures.cross)} Reject:        ${byCategory.reject || 0}

${chalk.white.bold('By Rating')}
${stars[5]}  ${byRating[5]}
${stars[4]}  ${byRating[4]}
${stars[3]}  ${byRating[3]}
${stars[2]}  ${byRating[2]}
${stars[1]}  ${byRating[1]}
`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: 'cyan',
    }
  );

  console.log(statsBox);
}

/**
 * Display organization results
 */
export function showOrganizationResults(results) {
  const { summary, outputDir } = results;

  console.log();
  console.log(chalk.green.bold(`${figures.tick} Organization Complete!`));
  console.log();
  console.log(chalk.gray('Output directory:'), chalk.white(outputDir));
  console.log();
  console.log(chalk.white.bold('Summary:'));
  console.log(chalk.gray('  Total processed:'), chalk.white(summary.total));
  console.log(chalk.gray('  Successful:'), chalk.green(summary.successful));
  if (summary.failed > 0) {
    console.log(chalk.gray('  Failed:'), chalk.red(summary.failed));
  }
  console.log();
  console.log(chalk.white.bold('By Category:'));
  for (const [category, count] of Object.entries(summary.byCategory)) {
    console.log(`  ${formatCategory(category)}: ${count}`);
  }
  console.log();
}

/**
 * Show burst group analysis
 */
export function showBurstGroups(groups) {
  if (groups.length === 0) {
    console.log(chalk.gray('No burst groups detected.'));
    return;
  }

  console.log(chalk.white.bold(`\n${figures.pointer} Detected ${groups.length} burst group(s):\n`));

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const scores = group.images.map(img => img.scoring?.overall || 0);
    const bestIndex = scores.indexOf(Math.max(...scores));
    const bestImage = group.images[bestIndex];

    console.log(chalk.cyan(`Burst ${i + 1}: ${group.size} images`));
    console.log(chalk.gray(`  Best: ${bestImage.file.name} (score: ${formatScore(scores[bestIndex])})`));
    console.log(chalk.gray(`  Range: ${Math.min(...scores)} - ${Math.max(...scores)}`));
    console.log();
  }
}

/**
 * Display error message
 */
export function showError(message, details = null) {
  console.log();
  console.log(chalk.red.bold(`${figures.cross} Error: ${message}`));
  if (details) {
    console.log(chalk.gray(details));
  }
  console.log();
}

/**
 * Display success message
 */
export function showSuccess(message) {
  console.log(chalk.green(`${figures.tick} ${message}`));
}

/**
 * Display warning message
 */
export function showWarning(message) {
  console.log(chalk.yellow(`${figures.warning} ${message}`));
}

/**
 * Display info message
 */
export function showInfo(message) {
  console.log(chalk.cyan(`${figures.info} ${message}`));
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, length) {
  if (str.length <= length) return str;
  return str.slice(0, length - 1) + '…';
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default {
  showBanner,
  formatScore,
  formatCategory,
  showImageResult,
  progressBar,
  showSummaryTable,
  showStatistics,
  showOrganizationResults,
  showBurstGroups,
  showError,
  showSuccess,
  showWarning,
  showInfo,
  formatDuration,
};
