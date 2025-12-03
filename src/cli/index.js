#!/usr/bin/env node
/**
 * RAW Classifier CLI
 * Main entry point for the command-line interface
 */
import { program } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';

import { analyzeImages, detectBurstGroups, cleanup } from '../analyzers/imageAnalyzer.js';
import { scanDirectory, organizeImages } from '../utils/fileOrganizer.js';
import { generateHtmlReport } from '../utils/reportGenerator.js';
import { searchFiles, getDirectoryStats, parseFilter, FILTER_TYPES } from '../search/searchEngine.js';
import { displayStats, displaySearchResults, displayFilterHelp } from '../search/statsDisplay.js';
import { saveStats } from '../search/statsExporter.js';
import { closeExifTool } from '../analyzers/exifParser.js';
import { findDuplicates, checkExistingDuplicates, removeDuplicates } from '../utils/duplicateDetector.js';
import * as ui from './ui.js';

// Version from package.json
const VERSION = '1.0.0';

program
  .name('raw-classify')
  .description('RAW photo classifier and organizer')
  .version(VERSION);

/**
 * Analyze command
 */
program
  .command('analyze <directory>')
  .description('Analyze RAW files in a directory')
  .option('-r, --recursive', 'Scan subdirectories', false)
  .option('-o, --output <dir>', 'Output directory for organized files')
  .option('--move', 'Move files instead of copying (default is copy)')
  .option('-d, --dry-run', 'Preview changes without applying', false)
  .option('-m, --mode <mode>', 'Scoring mode: general, landscape', 'general')
  .option('--skip-organize', 'Only analyze, do not organize', false)
  .option('--skip-duplicates', 'Skip duplicate detection when output exists', false)
  .option('--json', 'Output results as JSON', false)
  .option('--report <path>', 'Generate HTML report at specified path')
  .option('--concurrency <n>', 'Number of parallel analyses', '4')
  .action(async (directory, options) => {
    try {
      if (!options.json) {
        ui.showBanner();
      }

      // Validate directory
      const dirPath = path.resolve(directory);
      try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          ui.showError('Path is not a directory', dirPath);
          process.exit(1);
        }
      } catch {
        ui.showError('Directory not found', dirPath);
        process.exit(1);
      }

      // Scan for files
      const spinner = ora('Scanning for RAW files...').start();
      const files = await scanDirectory(dirPath, { recursive: options.recursive });
      spinner.stop();

      if (files.length === 0) {
        ui.showWarning('No supported files found in directory');
        process.exit(0);
      }

      ui.showInfo(`Found ${files.length} file(s) to analyze`);
      console.log();

      // Analyze files
      const startTime = Date.now();
      let lastProgress = 0;
      const progressSpinner = ora('Analyzing images...').start();

      const results = await analyzeImages(
        files,
        {
          concurrency: parseInt(options.concurrency, 10),
          mode: options.mode,
        },
        (progress) => {
          const percent = Math.round((progress.completed / progress.total) * 100);
          if (percent !== lastProgress) {
            progressSpinner.text = `Analyzing images... ${ui.progressBar(progress.completed, progress.total)}`;
            lastProgress = percent;
          }
        }
      );

      const analysisTime = Date.now() - startTime;
      progressSpinner.succeed(`Analysis complete in ${ui.formatDuration(analysisTime)}`);

      // Output results
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log();
        ui.showStatistics(results);
        ui.showSummaryTable(results);

        // Detect bursts
        const bursts = detectBurstGroups(results);
        if (bursts.length > 0) {
          ui.showBurstGroups(bursts);
        }

        // Organize files if requested
        if (!options.skipOrganize && options.output) {
          console.log();
          const outputDir = path.resolve(options.output);

          // Check for duplicates in output directory
          let filesToOrganize = results;
          if (!options.skipDuplicates) {
            try {
              const outputStats = await fs.stat(outputDir);
              if (outputStats.isDirectory()) {
                const dupSpinner = ora('Checking for duplicates in output...').start();

                const sourceFiles = results.filter(r => r.success).map(r => r.file.path);
                const dupCheck = await checkExistingDuplicates(sourceFiles, outputDir);

                dupSpinner.stop();

                if (dupCheck.duplicates.length > 0) {
                  console.log(chalk.yellow(`  ⚠ Found ${dupCheck.duplicates.length} duplicate(s) already in output directory`));
                  console.log(chalk.dim(`    Skipping duplicates, ${dupCheck.newFiles.length} new files to organize`));

                  // Filter results to only include new files
                  const newFilePaths = new Set(dupCheck.newFiles);
                  filesToOrganize = results.filter(r => r.success && newFilePaths.has(r.file.path));

                  if (filesToOrganize.length === 0) {
                    ui.showInfo('All files already exist in output directory');
                    await cleanup();
                    process.exit(0);
                  }
                }
              }
            } catch {
              // Output dir doesn't exist yet, no duplicates possible
            }
          }

          const orgSpinner = ora('Organizing files...').start();

          const useMove = options.move === true;
          const orgResults = await organizeImages(filesToOrganize, outputDir, {
            copy: !useMove,  // Default is COPY, --move flag disables it
            dryRun: options.dryRun,
          });

          orgSpinner.stop();
          ui.showOrganizationResults(orgResults);

          if (options.dryRun) {
            ui.showWarning('Dry run - no files were copied');
          }
        }

        // Generate report if requested
        if (options.report) {
          const reportSpinner = ora('Generating HTML report...').start();
          const reportPath = path.resolve(options.report);
          await generateHtmlReport(results, reportPath);
          reportSpinner.succeed(`Report generated: ${reportPath}`);
        }
      }

      // Cleanup
      await cleanup();
      process.exit(0);
    } catch (error) {
      ui.showError('Analysis failed', error.message);
      await cleanup();
      process.exit(1);
    }
  });

/**
 * Info command - show single file analysis
 */
program
  .command('info <file>')
  .description('Show detailed analysis of a single file')
  .action(async (file) => {
    try {
      ui.showBanner();

      const filePath = path.resolve(file);

      const spinner = ora('Analyzing file...').start();

      const results = await analyzeImages([filePath]);

      spinner.stop();

      if (results.length > 0 && results[0].success) {
        ui.showImageResult(results[0]);
      } else {
        ui.showError('Analysis failed', results[0]?.error || 'Unknown error');
      }

      await cleanup();
    } catch (error) {
      ui.showError('Error', error.message);
      await cleanup();
      process.exit(1);
    }
  });

/**
 * Search command - find RAW files by EXIF filters
 */
program
  .command('search <directory>')
  .description('Search RAW files by EXIF metadata filters')
  .option('-r, --recursive', 'Scan subdirectories', true)
  .option('--iso <range>', 'Filter by ISO (e.g., 100-800, >1600, <400)')
  .option('--aperture <range>', 'Filter by aperture (e.g., 1.4-2.8, <4, >5.6)')
  .option('--shutter <range>', 'Filter by shutter speed in seconds (e.g., 0.001-0.01)')
  .option('--focal <range>', 'Filter by focal length in mm (e.g., 35-85, >100)')
  .option('--camera <text>', 'Filter by camera model (partial match)')
  .option('--lens <text>', 'Filter by lens model (partial match)')
  .option('--date <range>', 'Filter by date (YYYY-MM-DD or YYYY-MM-DD:YYYY-MM-DD)')
  .option('--orientation <type>', 'Filter by orientation (landscape, portrait, square)')
  .option('--flash <boolean>', 'Filter by flash fired (true/false)')
  .option('--sort <field>', 'Sort by field (iso, aperture, shutter, focal, date)')
  .option('--desc', 'Sort in descending order', false)
  .option('--limit <n>', 'Limit results', '100')
  .option('--paths', 'Show full file paths', false)
  .option('--json', 'Output as JSON', false)
  .option('--help-filters', 'Show available filters and examples')
  .action(async (directory, options) => {
    try {
      // Show filter help if requested
      if (options.helpFilters) {
        ui.showBanner();
        displayFilterHelp(FILTER_TYPES);
        process.exit(0);
      }

      if (!options.json) {
        ui.showBanner();
      }

      // Validate directory
      const dirPath = path.resolve(directory);
      try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          ui.showError('Path is not a directory', dirPath);
          process.exit(1);
        }
      } catch {
        ui.showError('Directory not found', dirPath);
        process.exit(1);
      }

      // Parse filters from options
      const filters = [];
      const filterKeys = ['iso', 'aperture', 'shutter', 'focal', 'camera', 'lens', 'date', 'orientation', 'flash'];

      for (const key of filterKeys) {
        if (options[key]) {
          try {
            filters.push(parseFilter(key, options[key]));
          } catch (error) {
            ui.showError(`Invalid filter for ${key}`, error.message);
            process.exit(1);
          }
        }
      }

      // Search
      const spinner = ora('Searching files...').start();
      let lastProgress = 0;

      const searchResults = await searchFiles(dirPath, filters, {
        recursive: options.recursive,
        limit: parseInt(options.limit, 10),
        sortBy: options.sort,
        sortOrder: options.desc ? 'desc' : 'asc',
        onProgress: (processed, total) => {
          const percent = Math.round((processed / total) * 100);
          if (percent !== lastProgress && percent % 5 === 0) {
            spinner.text = `Searching... ${percent}% (${processed}/${total})`;
            lastProgress = percent;
          }
        },
      });

      spinner.stop();

      // Output results
      if (options.json) {
        console.log(JSON.stringify(searchResults, null, 2));
      } else {
        displaySearchResults(searchResults, { showExif: options.paths });

        // Show stats for matched files if filters were applied
        if (filters.length > 0 && searchResults.matched > 0) {
          console.log();
          console.log(chalk.bold.cyan('Statistics for matched files:'));
          console.log();
        }
      }

      await closeExifTool();
      process.exit(0);
    } catch (error) {
      ui.showError('Search failed', error.message);
      await closeExifTool();
      process.exit(1);
    }
  });

/**
 * Stats command - show statistics for a directory
 */
program
  .command('stats <directory>')
  .description('Show statistics for RAW files in a directory')
  .option('-r, --recursive', 'Scan subdirectories', true)
  .option('-v, --verbose', 'Show detailed statistics', false)
  .option('-c, --compact', 'Show compact statistics (no distributions)', false)
  .option('-o, --output <file>', 'Save stats to file (.md, .html, or .json)')
  .option('--json', 'Output as JSON to stdout', false)
  .action(async (directory, options) => {
    try {
      if (!options.json) {
        ui.showBanner();
      }

      // Validate output format FIRST (before any processing)
      const validFormats = ['.md', '.markdown', '.html', '.htm', '.json'];
      if (options.output) {
        const ext = path.extname(options.output).toLowerCase();
        if (!validFormats.includes(ext)) {
          ui.showError(
            'Invalid output format',
            `"${ext || 'no extension'}" is not supported. Use: ${validFormats.join(', ')}`
          );
          process.exit(1);
        }
      }

      // Validate directory
      const dirPath = path.resolve(directory);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          ui.showError('Path is not a directory', dirPath);
          process.exit(1);
        }
      } catch {
        ui.showError('Directory not found', dirPath);
        process.exit(1);
      }

      // Get stats
      const spinner = ora('Analyzing directory...').start();
      let lastProgress = 0;

      const results = await getDirectoryStats(dirPath, {
        recursive: options.recursive,
        onProgress: (processed, total) => {
          const percent = Math.round((processed / total) * 100);
          if (percent !== lastProgress && percent % 5 === 0) {
            spinner.text = `Analyzing... ${percent}% (${processed}/${total})`;
            lastProgress = percent;
          }
        },
      });

      spinner.stop();

      // Save to file if requested
      if (options.output) {
        const outputPath = path.resolve(options.output);
        const saveSpinner = ora('Saving report...').start();
        try {
          await saveStats(results.stats, outputPath, {
            title: 'Photo Statistics Report',
            directory: dirPath,
          });
          saveSpinner.succeed(`Report saved to ${outputPath}`);
        } catch (error) {
          saveSpinner.fail(`Failed to save: ${error.message}`);
        }
      }

      // Output to stdout
      if (options.json) {
        console.log(JSON.stringify(results.stats, null, 2));
      } else if (!options.output) {
        displayStats(results.stats, {
          verbose: options.verbose,
          compact: options.compact,
        });
      }

      await closeExifTool();
      process.exit(0);
    } catch (error) {
      ui.showError('Stats failed', error.message);
      await closeExifTool();
      process.exit(1);
    }
  });

/**
 * Duplicates command - find duplicate files
 */
program
  .command('duplicates <directory>')
  .description('Find duplicate files in a directory')
  .option('-r, --recursive', 'Scan subdirectories', true)
  .option('-m, --method <method>', 'Detection method: hash, exif, hybrid', 'hybrid')
  .option('--delete', 'Delete duplicates (keep oldest)', false)
  .option('-d, --dry-run', 'Preview deletions without applying', true)
  .option('--json', 'Output as JSON', false)
  .action(async (directory, options) => {
    try {
      if (!options.json) {
        ui.showBanner();
      }

      // Validate directory
      const dirPath = path.resolve(directory);
      try {
        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
          ui.showError('Path is not a directory', dirPath);
          process.exit(1);
        }
      } catch {
        ui.showError('Directory not found', dirPath);
        process.exit(1);
      }

      // Scan for files
      const scanSpinner = ora('Scanning for files...').start();
      const files = await scanDirectory(dirPath, { recursive: options.recursive });
      scanSpinner.stop();

      if (files.length === 0) {
        ui.showWarning('No supported files found');
        process.exit(0);
      }

      ui.showInfo(`Found ${files.length} file(s) to check`);

      // Find duplicates
      const spinner = ora('Analyzing files for duplicates...').start();
      let lastProgress = 0;

      const results = await findDuplicates(files, {
        method: options.method,
        onProgress: (processed, total) => {
          const percent = Math.round((processed / total) * 100);
          if (percent !== lastProgress && percent % 5 === 0) {
            spinner.text = `Analyzing... ${percent}% (${processed}/${total})`;
            lastProgress = percent;
          }
        },
      });

      spinner.stop();

      // Output
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log();
        console.log(chalk.bold('📊 Duplicate Analysis Results'));
        console.log();
        console.log(`  Total files:      ${chalk.white(results.stats.totalFiles)}`);
        console.log(`  Unique files:     ${chalk.green(results.stats.uniqueFiles)}`);
        console.log(`  Duplicate files:  ${chalk.yellow(results.stats.duplicateFiles)}`);
        console.log(`  Duplicate groups: ${chalk.yellow(results.stats.duplicateGroups)}`);
        console.log(`  Wasted space:     ${chalk.red(results.stats.wastedSpaceFormatted)}`);
        console.log();

        if (results.duplicates.length > 0) {
          console.log(chalk.bold('Duplicate Groups:'));
          console.log();

          for (let i = 0; i < Math.min(results.duplicates.length, 20); i++) {
            const group = results.duplicates[i];
            console.log(chalk.cyan(`  Group ${i + 1} (${group.count} files):`));
            console.log(chalk.green(`    ✓ Original: ${group.original.filename}`));
            console.log(chalk.dim(`      ${group.original.path}`));

            for (const copy of group.copies) {
              console.log(chalk.yellow(`    ✗ Duplicate: ${copy.filename}`));
              console.log(chalk.dim(`      ${copy.path}`));
            }
            console.log();
          }

          if (results.duplicates.length > 20) {
            console.log(chalk.dim(`  ... and ${results.duplicates.length - 20} more groups`));
            console.log();
          }

          // Delete option
          if (options.delete) {
            if (options.dryRun) {
              console.log(chalk.yellow('Dry run - no files will be deleted'));
              console.log(chalk.dim(`Would free ${results.stats.wastedSpaceFormatted}`));
            } else {
              const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `Delete ${results.stats.duplicateFiles} duplicate files and free ${results.stats.wastedSpaceFormatted}?`,
                default: false,
              }]);

              if (confirm) {
                const deleteSpinner = ora('Deleting duplicates...').start();
                const deleteResults = await removeDuplicates(results.duplicates, { dryRun: false });
                deleteSpinner.stop();

                console.log(chalk.green(`✓ Deleted ${deleteResults.removed.length} files`));
                console.log(chalk.green(`✓ Freed ${deleteResults.freedSpaceFormatted}`));

                if (deleteResults.failed.length > 0) {
                  console.log(chalk.red(`✗ Failed to delete ${deleteResults.failed.length} files`));
                }
              } else {
                console.log(chalk.dim('Cancelled'));
              }
            }
          }
        } else {
          console.log(chalk.green('✓ No duplicates found!'));
        }
      }

      await closeExifTool();
      process.exit(0);
    } catch (error) {
      ui.showError('Duplicate detection failed', error.message);
      await closeExifTool();
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
