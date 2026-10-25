import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function detectChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const candidates = [
    '/home/sandbox/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome',
    '/home/sandbox/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

const executablePath = detectChromiumExecutable();

export default defineConfig({
  testDir: __dirname,
  testMatch: /demo\.spec\.ts/,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    screenshot: 'on',
    trace: 'off',
    ignoreHTTPSErrors: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        video: {
          mode: 'on',
          size: { width: 1920, height: 1080 },
        },
      },
    },
  ],
});
