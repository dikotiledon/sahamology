/**
 * Served-Surface Visual QA & Layout Verification Script.
 * Runs via Windows Node against the live Docker container at http://localhost:3000.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const outDir = path.join(__dirname, '..', 'artifacts');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const report = {
    testedAt: new Date().toISOString(),
    desktop: {},
    mobile: {},
  };

  try {
    // -------------------------------------------------------------
    // 1. Desktop Test (1280x900)
    // -------------------------------------------------------------
    console.log('Testing Desktop Viewport (1280x900)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto('http://localhost:3000/radar', { waitUntil: 'networkidle' });

    // Wait for the data table to populate
    await desktopPage.waitForSelector('.radar-table tbody tr', { timeout: 10000 });

    const desktopMetrics = await desktopPage.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const bodyWidth = document.body.clientWidth;
      const title = document.querySelector('.radar-title')?.textContent?.trim();
      const rows = document.querySelectorAll('.radar-table tbody tr').length;
      const kpiCols = window.getComputedStyle(document.querySelector('.radar-grid')).gridTemplateColumns;
      return { docWidth, bodyWidth, title, rows, kpiCols };
    });

    const desktopScreenshotPath = path.join(outDir, 'qa-desktop.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: false });
    console.log(`Saved desktop screenshot: ${desktopScreenshotPath}`);

    // Interaction test: Open Inspection Modal
    console.log('Testing Desktop Interaction: Clicking Inspeksi button on BBCA...');
    const firstInspectBtn = await desktopPage.waitForSelector('.radar-table tbody tr:first-child button');
    await firstInspectBtn.click();
    await desktopPage.waitForSelector('text=Diagnostik Radar:', { timeout: 5000 });

    const desktopModalMetrics = await desktopPage.evaluate(() => {
      const modal = document.querySelector('div[style*="position: fixed"] > .glass-card');
      if (!modal) return null;
      const rect = modal.getBoundingClientRect();
      const heading = modal.querySelector('h2')?.textContent?.trim();
      const evidenceCount = modal.querySelectorAll('ul li').length;
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        heading,
        evidenceCount,
      };
    });

    const desktopModalScreenshotPath = path.join(outDir, 'qa-desktop-modal.png');
    await desktopPage.screenshot({ path: desktopModalScreenshotPath, fullPage: false });
    console.log(`Saved desktop modal screenshot: ${desktopModalScreenshotPath}`);

    // Close modal
    const closeBtn = await desktopPage.waitForSelector('div[style*="position: fixed"] button:has-text("✕")');
    await closeBtn.click();
    await desktopContext.close();

    report.desktop = {
      metrics: desktopMetrics,
      modal: desktopModalMetrics,
      screenshots: {
        page: desktopScreenshotPath,
        modal: desktopModalScreenshotPath,
      },
    };

    // -------------------------------------------------------------
    // 2. Mobile Test (390x844 - iPhone 13/14)
    // -------------------------------------------------------------
    console.log('Testing Mobile Viewport (390x844, iPhone 13)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://localhost:3000/radar', { waitUntil: 'networkidle' });

    await mobilePage.waitForSelector('.radar-table tbody tr', { timeout: 10000 });

    const mobileMetrics = await mobilePage.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const bodyWidth = document.body.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const title = document.querySelector('.radar-title')?.textContent?.trim();
      const rows = document.querySelectorAll('.radar-table tbody tr').length;
      const kpiCols = window.getComputedStyle(document.querySelector('.radar-grid')).gridTemplateColumns;

      const container = document.querySelector('.container');
      const banner = document.querySelector('.radar-banner');
      const grid = document.querySelector('.radar-grid');

      return {
        docWidth,
        bodyWidth,
        scrollWidth,
        title,
        rows,
        kpiCols,
        containerWidth: container ? Math.round(container.getBoundingClientRect().width) : null,
        bannerWidth: banner ? Math.round(banner.getBoundingClientRect().width) : null,
        gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : null,
        hasHorizontalPageScroll: scrollWidth > docWidth,
      };
    });

    const mobileScreenshotPath = path.join(outDir, 'qa-mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log(`Saved mobile screenshot: ${mobileScreenshotPath}`);

    // Mobile Interaction test: Click Inspeksi
    console.log('Testing Mobile Interaction: Clicking Inspeksi button on mobile...');
    const mobileInspectBtn = await mobilePage.waitForSelector('.radar-table tbody tr:first-child button');
    await mobileInspectBtn.click();
    await mobilePage.waitForSelector('text=Diagnostik Radar:', { timeout: 5000 });

    const mobileModalMetrics = await mobilePage.evaluate(() => {
      const modal = document.querySelector('div[style*="position: fixed"] > .glass-card');
      if (!modal) return null;
      const rect = modal.getBoundingClientRect();
      const heading = modal.querySelector('h2')?.textContent?.trim();
      const evidenceCount = modal.querySelectorAll('ul li').length;
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        heading,
        evidenceCount,
        fitsInViewport: rect.right <= 390 + 2,
      };
    });

    const mobileModalScreenshotPath = path.join(outDir, 'qa-mobile-modal.png');
    await mobilePage.screenshot({ path: mobileModalScreenshotPath, fullPage: false });
    console.log(`Saved mobile modal screenshot: ${mobileModalScreenshotPath}`);

    await mobileContext.close();

    report.mobile = {
      metrics: mobileMetrics,
      modal: mobileModalMetrics,
      screenshots: {
        page: mobileScreenshotPath,
        modal: mobileModalScreenshotPath,
      },
    };

    console.log('\n--- VISUAL QA REPORT ---');
    console.log(JSON.stringify(report, null, 2));

    const reportPath = path.join(outDir, 'qa-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Report written to ${reportPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Visual QA execution failed:', err);
  process.exit(1);
});
