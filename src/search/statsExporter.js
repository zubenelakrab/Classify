/**
 * Stats Exporter Module
 * Export statistics to Markdown and HTML formats
 */
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Export statistics to Markdown
 */
export function exportToMarkdown(stats, options = {}) {
  const { title = 'Photo Statistics Report', directory = '' } = options;
  const lines = [];

  // Header
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toLocaleString()}`);
  if (directory) {
    lines.push(`**Directory:** \`${directory}\``);
  }
  lines.push(`**Total Files:** ${stats.totalFiles}`);
  lines.push('');

  // ISO Statistics
  if (stats.iso) {
    lines.push('## 📷 ISO Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Min | ${stats.iso.min} |`);
    lines.push(`| Max | ${stats.iso.max} |`);
    lines.push(`| Average | ${stats.iso.average} |`);
    lines.push(`| Median | ${stats.iso.median} |`);
    lines.push('');

    if (stats.iso.distribution) {
      lines.push('### ISO Distribution');
      lines.push('');
      lines.push('| Range | Count |');
      lines.push('|-------|-------|');
      for (const [range, count] of Object.entries(stats.iso.distribution)) {
        const bar = '█'.repeat(Math.min(20, Math.round(count / stats.totalFiles * 100)));
        lines.push(`| ${range} | ${count} ${bar} |`);
      }
      lines.push('');
    }
  }

  // Aperture Statistics
  if (stats.aperture) {
    lines.push('## 🔘 Aperture Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Min (widest) | f/${stats.aperture.min} |`);
    lines.push(`| Max (narrowest) | f/${stats.aperture.max} |`);
    lines.push(`| Average | f/${stats.aperture.average} |`);
    lines.push(`| Median | f/${stats.aperture.median} |`);
    lines.push('');

    if (stats.aperture.distribution) {
      lines.push('### Aperture Distribution');
      lines.push('');
      lines.push('| Range | Count |');
      lines.push('|-------|-------|');
      for (const [range, count] of Object.entries(stats.aperture.distribution)) {
        lines.push(`| ${range} | ${count} |`);
      }
      lines.push('');
    }
  }

  // Shutter Statistics
  if (stats.shutter) {
    lines.push('## ⏱️ Shutter Speed');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Fastest | ${stats.shutter.minFormatted} |`);
    lines.push(`| Slowest | ${stats.shutter.maxFormatted} |`);
    lines.push('');
  }

  // Focal Length Statistics
  if (stats.focalLength) {
    lines.push('## 🔭 Focal Length Statistics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Min | ${stats.focalLength.min}mm |`);
    lines.push(`| Max | ${stats.focalLength.max}mm |`);
    lines.push(`| Average | ${stats.focalLength.average}mm |`);
    lines.push(`| Median | ${stats.focalLength.median}mm |`);
    lines.push('');

    if (stats.focalLength.distribution) {
      lines.push('### Focal Length Distribution');
      lines.push('');
      lines.push('| Category | Count |');
      lines.push('|----------|-------|');
      for (const [category, count] of Object.entries(stats.focalLength.distribution)) {
        lines.push(`| ${category} | ${count} |`);
      }
      lines.push('');
    }
  }

  // Equipment
  if (stats.cameras?.length > 0) {
    lines.push('## 📸 Equipment');
    lines.push('');
    lines.push('### Cameras');
    lines.push('');
    lines.push('| Model | Count | % |');
    lines.push('|-------|-------|---|');
    for (const cam of stats.cameras) {
      lines.push(`| ${cam.model} | ${cam.count} | ${cam.percentage}% |`);
    }
    lines.push('');

    if (stats.lenses?.length > 0) {
      lines.push('### Lenses');
      lines.push('');
      lines.push('| Model | Count | % |');
      lines.push('|-------|-------|---|');
      for (const lens of stats.lenses) {
        lines.push(`| ${lens.model} | ${lens.count} | ${lens.percentage}% |`);
      }
      lines.push('');
    }
  }

  // Date Range
  if (stats.dateRange) {
    lines.push('## 📅 Date Range');
    lines.push('');
    lines.push(`- **From:** ${stats.dateRange.from}`);
    lines.push(`- **To:** ${stats.dateRange.to}`);
    lines.push('');

    if (stats.dateRange.shotsByDate?.length > 0) {
      lines.push('### Shots by Date');
      lines.push('');
      lines.push('| Date | Count |');
      lines.push('|------|-------|');
      for (const { date, count } of stats.dateRange.shotsByDate.slice(-15)) {
        const bar = '█'.repeat(Math.min(20, count));
        lines.push(`| ${date} | ${count} ${bar} |`);
      }
      lines.push('');
    }
  }

  // Orientation
  if (stats.orientation) {
    const total = stats.orientation.landscape + stats.orientation.portrait + stats.orientation.square;
    if (total > 0) {
      lines.push('## 🖼️ Orientation');
      lines.push('');
      lines.push('| Type | Count | % |');
      lines.push('|------|-------|---|');
      lines.push(`| Landscape | ${stats.orientation.landscape} | ${Math.round(stats.orientation.landscape / total * 100)}% |`);
      lines.push(`| Portrait | ${stats.orientation.portrait} | ${Math.round(stats.orientation.portrait / total * 100)}% |`);
      lines.push(`| Square | ${stats.orientation.square} | ${Math.round(stats.orientation.square / total * 100)}% |`);
      lines.push('');
    }
  }

  // Flash
  if (stats.flash) {
    const total = stats.flash.fired + stats.flash.notFired;
    if (total > 0) {
      lines.push('## ⚡ Flash Usage');
      lines.push('');
      lines.push('| Status | Count | % |');
      lines.push('|--------|-------|---|');
      lines.push(`| Fired | ${stats.flash.fired} | ${Math.round(stats.flash.fired / total * 100)}% |`);
      lines.push(`| Not Fired | ${stats.flash.notFired} | ${Math.round(stats.flash.notFired / total * 100)}% |`);
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('*Generated by RAW Classifier*');

  return lines.join('\n');
}

/**
 * Export statistics to HTML
 */
export function exportToHtml(stats, options = {}) {
  const { title = 'Photo Statistics Report', directory = '' } = options;

  const css = `
    <style>
      :root {
        --bg-color: #1a1a2e;
        --card-bg: #16213e;
        --text-color: #eee;
        --accent: #0f4c75;
        --highlight: #3282b8;
        --success: #4caf50;
        --warning: #ff9800;
      }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--bg-color);
        color: var(--text-color);
        margin: 0;
        padding: 20px;
        line-height: 1.6;
      }
      .container { max-width: 1200px; margin: 0 auto; }
      h1 {
        text-align: center;
        color: var(--highlight);
        margin-bottom: 10px;
      }
      .meta {
        text-align: center;
        color: #888;
        margin-bottom: 30px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
      }
      .card {
        background: var(--card-bg);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      }
      .card h2 {
        margin-top: 0;
        color: var(--highlight);
        font-size: 1.2em;
        border-bottom: 2px solid var(--accent);
        padding-bottom: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
      }
      th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #333;
      }
      th { color: var(--highlight); }
      .bar-container {
        background: #333;
        border-radius: 4px;
        height: 20px;
        overflow: hidden;
      }
      .bar {
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--highlight));
        border-radius: 4px;
        transition: width 0.3s;
      }
      .stat-value {
        font-size: 2em;
        font-weight: bold;
        color: var(--highlight);
      }
      .stat-label { color: #888; }
      .equipment-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #333;
      }
      .equipment-item:last-child { border-bottom: none; }
      .percentage { color: var(--highlight); }
      footer {
        text-align: center;
        color: #666;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #333;
      }
    </style>
  `;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${css}
</head>
<body>
  <div class="container">
    <h1>📊 ${title}</h1>
    <div class="meta">
      <p>Generated: ${new Date().toLocaleString()}</p>
      ${directory ? `<p>Directory: <code>${directory}</code></p>` : ''}
      <p><strong>${stats.totalFiles}</strong> files analyzed</p>
    </div>

    <div class="grid">
`;

  // ISO Card
  if (stats.iso) {
    html += `
      <div class="card">
        <h2>📷 ISO Statistics</h2>
        <table>
          <tr><th>Min</th><td>${stats.iso.min}</td></tr>
          <tr><th>Max</th><td>${stats.iso.max}</td></tr>
          <tr><th>Average</th><td>${stats.iso.average}</td></tr>
          <tr><th>Median</th><td>${stats.iso.median}</td></tr>
        </table>
        ${stats.iso.distribution ? generateDistributionBars(stats.iso.distribution, stats.totalFiles) : ''}
      </div>
    `;
  }

  // Aperture Card
  if (stats.aperture) {
    html += `
      <div class="card">
        <h2>🔘 Aperture</h2>
        <table>
          <tr><th>Min (widest)</th><td>f/${stats.aperture.min}</td></tr>
          <tr><th>Max (narrowest)</th><td>f/${stats.aperture.max}</td></tr>
          <tr><th>Average</th><td>f/${stats.aperture.average}</td></tr>
          <tr><th>Median</th><td>f/${stats.aperture.median}</td></tr>
        </table>
        ${stats.aperture.distribution ? generateDistributionBars(stats.aperture.distribution, stats.totalFiles) : ''}
      </div>
    `;
  }

  // Shutter Card
  if (stats.shutter) {
    html += `
      <div class="card">
        <h2>⏱️ Shutter Speed</h2>
        <table>
          <tr><th>Fastest</th><td>${stats.shutter.minFormatted}</td></tr>
          <tr><th>Slowest</th><td>${stats.shutter.maxFormatted}</td></tr>
        </table>
      </div>
    `;
  }

  // Focal Length Card
  if (stats.focalLength) {
    html += `
      <div class="card">
        <h2>🔭 Focal Length</h2>
        <table>
          <tr><th>Min</th><td>${stats.focalLength.min}mm</td></tr>
          <tr><th>Max</th><td>${stats.focalLength.max}mm</td></tr>
          <tr><th>Average</th><td>${stats.focalLength.average}mm</td></tr>
          <tr><th>Median</th><td>${stats.focalLength.median}mm</td></tr>
        </table>
        ${stats.focalLength.distribution ? generateDistributionBars(stats.focalLength.distribution, stats.totalFiles) : ''}
      </div>
    `;
  }

  // Cameras Card
  if (stats.cameras?.length > 0) {
    html += `
      <div class="card">
        <h2>📸 Cameras</h2>
        ${stats.cameras.map(cam => `
          <div class="equipment-item">
            <span>${cam.model}</span>
            <span><strong>${cam.count}</strong> <span class="percentage">(${cam.percentage}%)</span></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Lenses Card
  if (stats.lenses?.length > 0) {
    html += `
      <div class="card">
        <h2>🔍 Lenses</h2>
        ${stats.lenses.map(lens => `
          <div class="equipment-item">
            <span>${lens.model}</span>
            <span><strong>${lens.count}</strong> <span class="percentage">(${lens.percentage}%)</span></span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Date Range Card
  if (stats.dateRange) {
    html += `
      <div class="card">
        <h2>📅 Date Range</h2>
        <table>
          <tr><th>From</th><td>${stats.dateRange.from}</td></tr>
          <tr><th>To</th><td>${stats.dateRange.to}</td></tr>
        </table>
        ${stats.dateRange.shotsByDate?.length > 0 ? `
          <h3 style="color: #888; font-size: 0.9em; margin-top: 15px;">Recent Activity</h3>
          ${generateDateBars(stats.dateRange.shotsByDate.slice(-10))}
        ` : ''}
      </div>
    `;
  }

  // Orientation Card
  if (stats.orientation) {
    const total = stats.orientation.landscape + stats.orientation.portrait + stats.orientation.square;
    if (total > 0) {
      html += `
        <div class="card">
          <h2>🖼️ Orientation</h2>
          <table>
            <tr>
              <th>Landscape</th>
              <td>${stats.orientation.landscape} (${Math.round(stats.orientation.landscape / total * 100)}%)</td>
            </tr>
            <tr>
              <th>Portrait</th>
              <td>${stats.orientation.portrait} (${Math.round(stats.orientation.portrait / total * 100)}%)</td>
            </tr>
            <tr>
              <th>Square</th>
              <td>${stats.orientation.square} (${Math.round(stats.orientation.square / total * 100)}%)</td>
            </tr>
          </table>
        </div>
      `;
    }
  }

  // Flash Card
  if (stats.flash) {
    const total = stats.flash.fired + stats.flash.notFired;
    if (total > 0) {
      html += `
        <div class="card">
          <h2>⚡ Flash Usage</h2>
          <table>
            <tr><th>Fired</th><td>${stats.flash.fired} (${Math.round(stats.flash.fired / total * 100)}%)</td></tr>
            <tr><th>Not Fired</th><td>${stats.flash.notFired} (${Math.round(stats.flash.notFired / total * 100)}%)</td></tr>
          </table>
        </div>
      `;
    }
  }

  html += `
    </div>
    <footer>
      <p>Generated by RAW Classifier</p>
    </footer>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Generate distribution bars HTML
 */
function generateDistributionBars(distribution, total) {
  const maxCount = Math.max(...Object.values(distribution));
  let html = '<div style="margin-top: 15px;">';

  for (const [label, count] of Object.entries(distribution)) {
    const percentage = Math.round(count / maxCount * 100);
    html += `
      <div style="margin: 8px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.85em;">${label}</span>
          <span style="font-size: 0.85em; color: #888;">${count}</span>
        </div>
        <div class="bar-container">
          <div class="bar" style="width: ${percentage}%;"></div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

/**
 * Generate date bars HTML
 */
function generateDateBars(shotsByDate) {
  const maxCount = Math.max(...shotsByDate.map(d => d.count));
  let html = '<div style="margin-top: 10px;">';

  for (const { date, count } of shotsByDate) {
    const percentage = Math.round(count / maxCount * 100);
    html += `
      <div style="margin: 6px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span style="font-size: 0.8em; color: #888;">${date}</span>
          <span style="font-size: 0.8em;">${count}</span>
        </div>
        <div class="bar-container" style="height: 12px;">
          <div class="bar" style="width: ${percentage}%;"></div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

/**
 * Save stats to file
 */
export async function saveStats(stats, outputPath, options = {}) {
  const ext = path.extname(outputPath).toLowerCase();
  let content;

  if (ext === '.md' || ext === '.markdown') {
    content = exportToMarkdown(stats, options);
  } else if (ext === '.html' || ext === '.htm') {
    content = exportToHtml(stats, options);
  } else if (ext === '.json') {
    content = JSON.stringify(stats, null, 2);
  } else {
    throw new Error(`Unsupported format: ${ext}. Use .md, .html, or .json`);
  }

  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

export default {
  exportToMarkdown,
  exportToHtml,
  saveStats,
};
