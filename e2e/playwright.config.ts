import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL || 'https://get-me-an-alt.vercel.app';

function detectChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const candidates = [
    '/workspace/work/ms-playwright/chromium-1248/chrome-linux-arm64/chrome',
    '/workspace/work/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell',
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
const extraLibDirs = [
  '/workspace/work/chromelibs/root/usr/lib/aarch64-linux-gnu',
  '/workspace/work/chromelibs/root/usr/lib/x86_64-linux-gnu',
].filter((d) => fs.existsSync(d));
const ldLibraryPath = [
  ...extraLibDirs,
  ...(process.env.LD_LIBRARY_PATH ? [process.env.LD_LIBRARY_PATH] : []),
].join(':');

export default defineConfig({
  testDir: __dirname,
  testMatch: /(demo|anyobject|live\/.*)\.spec\.ts/,
  timeout: 360_000,
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
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    screenshot: 'off',
    trace: 'off',
    ignoreHTTPSErrors: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      env: {
        ...process.env,
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
      },
      args: [
        '--no-proxy-server',
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
