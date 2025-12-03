/**
 * Report Generator Module
 * Generates HTML and JSON reports from analysis results
 */
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Generate comprehensive HTML report
 * @param {Object[]} results - Analysis results
 * @param {string} outputPath - Output file path
 * @param {Object} options - Report options
 */
export async function generateHtmlReport(results, outputPath, options = {}) {
  const {
    title = 'RAW Classifier Report',
    includeCharts = true,
  } = options;

  const successful = results.filter(r => r.success);
  const stats = calculateStatistics(successful);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-card: #0f3460;
      --text-primary: #eaeaea;
      --text-secondary: #a0a0a0;
      --accent-green: #4ade80;
      --accent-yellow: #fbbf24;
      --accent-red: #f87171;
      --accent-blue: #60a5fa;
      --accent-purple: #a78bfa;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      text-align: center;
      padding: 3rem 0;
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
      border-radius: 1rem;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 1.1rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }

    .card h3 {
      color: var(--text-secondary);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .card .value {
      font-size: 2.5rem;
      font-weight: bold;
    }

    .card .subvalue {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .score-excellent { color: var(--accent-green); }
    .score-good { color: var(--accent-blue); }
    .score-average { color: var(--accent-yellow); }
    .score-poor { color: var(--accent-red); }

    .charts-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .chart-card {
      background: var(--bg-secondary);
      border-radius: 1rem;
      padding: 1.5rem;
    }

    .chart-card h2 {
      margin-bottom: 1rem;
      font-size: 1.2rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-secondary);
      border-radius: 1rem;
      overflow: hidden;
    }

    th, td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid var(--bg-card);
    }

    th {
      background: var(--bg-card);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }

    tr:hover {
      background: var(--bg-card);
    }

    .rating {
      color: var(--accent-yellow);
    }

    .category-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .category-select { background: rgba(74, 222, 128, 0.2); color: var(--accent-green); }
    .category-good { background: rgba(96, 165, 250, 0.2); color: var(--accent-blue); }
    .category-review { background: rgba(251, 191, 36, 0.2); color: var(--accent-yellow); }
    .category-maybe { background: rgba(160, 160, 160, 0.2); color: var(--text-secondary); }
    .category-reject { background: rgba(248, 113, 113, 0.2); color: var(--accent-red); }

    .issues-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .issue-tag {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      background: rgba(248, 113, 113, 0.2);
      color: var(--accent-red);
      border-radius: 4px;
    }

    .progress-bar {
      height: 8px;
      background: var(--bg-card);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .breakdown-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .breakdown-label {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .breakdown-value {
      font-size: 1.5rem;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>RAW Classifier Report</h1>
      <p class="subtitle">Analysis of ${stats.total} images • Generated ${new Date().toLocaleDateString()}</p>
    </header>

    <div class="grid">
      <div class="card">
        <h3>Total Images</h3>
        <div class="value">${stats.total}</div>
        <div class="subvalue">${stats.failed} failed to analyze</div>
      </div>
      <div class="card">
        <h3>Average Score</h3>
        <div class="value ${getScoreClass(stats.avgScore)}">${stats.avgScore}</div>
        <div class="subvalue">Range: ${stats.minScore} - ${stats.maxScore}</div>
      </div>
      <div class="card">
        <h3>Selects</h3>
        <div class="value score-excellent">${stats.byCategory.select || 0}</div>
        <div class="subvalue">${Math.round(((stats.byCategory.select || 0) / stats.total) * 100)}% of total</div>
      </div>
      <div class="card">
        <h3>Rejects</h3>
        <div class="value score-poor">${stats.byCategory.reject || 0}</div>
        <div class="subvalue">${Math.round(((stats.byCategory.reject || 0) / stats.total) * 100)}% of total</div>
      </div>
    </div>

    ${includeCharts ? `
    <div class="charts-row">
      <div class="chart-card">
        <h2>Distribution by Category</h2>
        <canvas id="categoryChart"></canvas>
      </div>
      <div class="chart-card">
        <h2>Distribution by Rating</h2>
        <canvas id="ratingChart"></canvas>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h2>Score Distribution</h2>
        <canvas id="scoreHistogram"></canvas>
      </div>
      <div class="chart-card">
        <h2>Common Issues</h2>
        <canvas id="issuesChart"></canvas>
      </div>
    </div>
    ` : ''}

    <div class="card" style="margin-bottom: 2rem;">
      <h2 style="margin-bottom: 1rem;">Score Breakdown</h2>
      <div class="breakdown-grid">
        <div class="breakdown-item">
          <span class="breakdown-label">Sharpness</span>
          <span class="breakdown-value ${getScoreClass(stats.avgSharpness)}">${stats.avgSharpness}</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">Exposure</span>
          <span class="breakdown-value ${getScoreClass(stats.avgExposure)}">${stats.avgExposure}</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">Focus Accuracy</span>
          <span class="breakdown-value ${getScoreClass(stats.avgFocus)}">${stats.avgFocus}</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">Composition</span>
          <span class="breakdown-value ${getScoreClass(stats.avgComposition)}">${stats.avgComposition}</span>
        </div>
      </div>
    </div>

    <h2 style="margin-bottom: 1rem;">All Images (sorted by score)</h2>
    <table>
      <thead>
        <tr>
          <th>File</th>
          <th>Score</th>
          <th>Rating</th>
          <th>Category</th>
          <th>Sharpness</th>
          <th>Exposure</th>
          <th>Issues</th>
        </tr>
      </thead>
      <tbody>
        ${successful
          .sort((a, b) => (b.scoring?.overall || 0) - (a.scoring?.overall || 0))
          .map(r => `
            <tr>
              <td>${r.file?.name || 'Unknown'}</td>
              <td class="${getScoreClass(r.scoring?.overall || 0)}">${r.scoring?.overall || 0}</td>
              <td class="rating">${'★'.repeat(r.scoring?.rating || 0)}${'☆'.repeat(5 - (r.scoring?.rating || 0))}</td>
              <td><span class="category-badge category-${r.scoring?.classification?.category || 'review'}">${r.scoring?.classification?.category || 'unknown'}</span></td>
              <td class="${getScoreClass(r.scoring?.scores?.sharpness || 0)}">${r.scoring?.scores?.sharpness || 0}</td>
              <td class="${getScoreClass(r.scoring?.scores?.exposure || 0)}">${r.scoring?.scores?.exposure || 0}</td>
              <td>
                <div class="issues-list">
                  ${(r.scoring?.issues || []).slice(0, 3).map(i => `<span class="issue-tag">${i.message}</span>`).join('')}
                </div>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>

    <footer>
      <p>Generated by RAW Classifier • ${new Date().toISOString()}</p>
    </footer>
  </div>

  ${includeCharts ? `
  <script>
    // Category distribution chart
    new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: ['Selects', 'Good', 'Review', 'Maybe', 'Reject'],
        datasets: [{
          data: [${stats.byCategory.select || 0}, ${stats.byCategory.good || 0}, ${stats.byCategory.review || 0}, ${stats.byCategory.maybe || 0}, ${stats.byCategory.reject || 0}],
          backgroundColor: ['#4ade80', '#60a5fa', '#fbbf24', '#a0a0a0', '#f87171'],
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#eaeaea' } }
        }
      }
    });

    // Rating distribution chart
    new Chart(document.getElementById('ratingChart'), {
      type: 'bar',
      data: {
        labels: ['★★★★★', '★★★★☆', '★★★☆☆', '★★☆☆☆', '★☆☆☆☆'],
        datasets: [{
          label: 'Images',
          data: [${stats.byRating[5]}, ${stats.byRating[4]}, ${stats.byRating[3]}, ${stats.byRating[2]}, ${stats.byRating[1]}],
          backgroundColor: '#60a5fa',
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
          x: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } }
        }
      }
    });

    // Score histogram
    new Chart(document.getElementById('scoreHistogram'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(stats.scoreHistogram.labels)},
        datasets: [{
          label: 'Images',
          data: ${JSON.stringify(stats.scoreHistogram.data)},
          backgroundColor: '#a78bfa',
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
          x: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } }
        }
      }
    });

    // Issues chart
    new Chart(document.getElementById('issuesChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(Object.keys(stats.commonIssues).slice(0, 8))},
        datasets: [{
          label: 'Count',
          data: ${JSON.stringify(Object.values(stats.commonIssues).slice(0, 8))},
          backgroundColor: '#f87171',
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } },
          x: { ticks: { color: '#a0a0a0' }, grid: { color: '#333' } }
        }
      }
    });
  </script>
  ` : ''}
</body>
</html>`;

  await fs.writeFile(outputPath, html);
  return outputPath;
}

/**
 * Get CSS class for score
 */
function getScoreClass(score) {
  if (score >= 90) return 'score-excellent';
  if (score >= 75) return 'score-good';
  if (score >= 60) return 'score-average';
  return 'score-poor';
}

/**
 * Calculate comprehensive statistics
 */
function calculateStatistics(results) {
  const scores = results.map(r => r.scoring?.overall || 0);

  const stats = {
    total: results.length,
    failed: 0,
    avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    byCategory: {},
    byRating: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    avgSharpness: 0,
    avgExposure: 0,
    avgFocus: 0,
    avgComposition: 0,
    scoreHistogram: { labels: [], data: [] },
    commonIssues: {},
  };

  // Calculate averages
  let sharpnessSum = 0, exposureSum = 0, focusSum = 0, compositionSum = 0;

  for (const result of results) {
    const cat = result.scoring?.classification?.category || 'unknown';
    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;

    const rating = result.scoring?.rating || 1;
    stats.byRating[rating]++;

    sharpnessSum += result.scoring?.scores?.sharpness || 0;
    exposureSum += result.scoring?.scores?.exposure || 0;
    focusSum += result.scoring?.scores?.focusAccuracy || 0;
    compositionSum += result.scoring?.scores?.composition || 0;

    // Count issues
    for (const issue of result.scoring?.issues || []) {
      stats.commonIssues[issue.message] = (stats.commonIssues[issue.message] || 0) + 1;
    }
  }

  const n = results.length || 1;
  stats.avgSharpness = Math.round(sharpnessSum / n);
  stats.avgExposure = Math.round(exposureSum / n);
  stats.avgFocus = Math.round(focusSum / n);
  stats.avgComposition = Math.round(compositionSum / n);

  // Sort issues by frequency
  stats.commonIssues = Object.fromEntries(
    Object.entries(stats.commonIssues).sort((a, b) => b[1] - a[1])
  );

  // Score histogram (10-point buckets)
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const score of scores) {
    const bucket = Math.min(9, Math.floor(score / 10));
    buckets[bucket]++;
  }
  stats.scoreHistogram = {
    labels: ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'],
    data: buckets,
  };

  return stats;
}

/**
 * Generate JSON report
 */
export async function generateJsonReport(results, outputPath) {
  const successful = results.filter(r => r.success);
  const stats = calculateStatistics(successful);

  const report = {
    generated: new Date().toISOString(),
    version: '1.0',
    summary: stats,
    images: successful.map(r => ({
      file: r.file?.name,
      path: r.file?.path,
      score: r.scoring?.overall,
      rating: r.scoring?.rating,
      category: r.scoring?.classification?.category,
      scores: r.scoring?.scores,
      issues: r.scoring?.issues,
      metadata: {
        camera: r.exif?.camera?.model,
        lens: r.exif?.lens?.model,
        settings: {
          aperture: r.exif?.exposure?.aperture,
          shutter: r.exif?.exposure?.shutterSpeed,
          iso: r.exif?.exposure?.iso,
        },
        timestamp: r.exif?.timestamp?.taken,
      },
    })),
  };

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}

export default {
  generateHtmlReport,
  generateJsonReport,
};
