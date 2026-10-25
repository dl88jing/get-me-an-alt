import { test, expect, Page, CDPSession } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (
  process.env.BASE_URL || 'https://get-me-an-alt.vercel.app'
).replace(/\/+$/, '');

const OUT_DIR = '/workspace/work/out/e2e';

test.use({
  viewport: { width: 1920, height: 1080 },
});

const WOW_SLUGS = [
  {
    slug: 'desktop-robot-arm',
    title: '6-Axis Desktop Robot Arm',
    retail: 899,
    diy: 74.5,
    totalParts: 16,
    printedParts: 9,
    purchasedParts: 7,
    plates: 2,
    sampleStl: 'base-pedestal.stl',
  },
  {
    slug: 'bladeless-air-purifier',
    title: 'Bladeless HEPA Air Purifier Tower',
    retail: 549,
    diy: 58.4,
    totalParts: 15,
    printedParts: 9,
    purchasedParts: 6,
    plates: 7,
    sampleStl: 'coanda-airfoil-lower.stl',
  },
  {
    slug: 'camera-slider-3axis',
    title: '3-Axis Motorized Camera Slider',
    retail: 899,
    diy: 84.9,
    totalParts: 17,
    printedParts: 9,
    purchasedParts: 8,
    plates: 2,
    sampleStl: 'motor-end-block.stl',
  },
] as const;

const pageCdpMap = new WeakMap<Page, CDPSession>();

async function saveShot(page: Page, filename: string): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fullPath = path.join(OUT_DIR, filename);
  let session = pageCdpMap.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    pageCdpMap.set(page, session);
  }
  const { data } = await session.send('Page.captureScreenshot', {
    format: 'png',
  });
  fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
  return fullPath;
}

test.describe('Three New Showcase Instant Demos (Wow Samples)', () => {
  test.setTimeout(240_000);

  test('Landing page displays all 7 Instant Demo presets including the 3 new masterworks', async ({
    page,
  }) => {
    await page.route('**/media/hero.mp4', (r) => r.abort()).catch(() => {});
    const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);

    const gallery = page.locator('#folio-assembly');
    await page.evaluate(() => {
      document.getElementById('folio-assembly')?.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(500);

    for (const item of WOW_SLUGS) {
      await expect(gallery.getByText(item.title, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
    }

    await saveShot(page, 'wow-landing.png');
  });

  for (const item of WOW_SLUGS) {
    test(`Full E2E tab + API + STL/3MF verification for ${item.slug}`, async ({
      page,
      request,
    }) => {
      await page.route('**/media/hero.mp4', (r) => r.abort()).catch(() => {});

      // 1. Verify /api/objects/<slug> JSON contract
      const apiRes = await request.get(`${BASE_URL}/api/objects/${item.slug}`);
      expect(apiRes.status()).toBe(200);
      const apiData = await apiRes.json();
      const manifest = apiData.manifest;
      expect(manifest).toBeTruthy();
      expect(manifest.status).toBe('completed');
      expect(manifest.design.parts.length).toBe(item.totalParts);
      expect(manifest.plates.totalPlates).toBe(item.plates);
      expect(manifest.bom.summary.originalRetailPrice).toBe(item.retail);
      expect(manifest.bom.summary.totalDiyCost).toBeCloseTo(item.diy, 1);

      // 2. Verify /api/objects/<slug>/stl/<sampleStl> and all-plates.3mf
      const stlRes = await request.get(
        `${BASE_URL}/api/objects/${item.slug}/stl/${item.sampleStl}`
      );
      expect(stlRes.status()).toBe(200);
      const stlBytes = await stlRes.body();
      expect(stlBytes.byteLength).toBeGreaterThan(5000);

      const threemfRes = await request.get(
        `${BASE_URL}/api/objects/${item.slug}/stl/all-plates.3mf`
      );
      expect(threemfRes.status()).toBe(200);
      const threemfBytes = await threemfRes.body();
      expect(threemfBytes.byteLength).toBeGreaterThan(20000);

      // 3. Navigate to /projects/<slug>
      const pageRes = await page.goto(`${BASE_URL}/projects/${item.slug}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(pageRes?.status()).toBe(200);
      await page.waitForTimeout(800);

      // Tab 1: Overview
      const overviewBtn = page.getByRole('button', { name: /^Overview/i }).first();
      await expect(overviewBtn).toBeVisible({ timeout: 15_000 });
      await overviewBtn.click({ force: true });
      await page.waitForTimeout(500);
      await expect(
        page.getByText(/3D-Printed (Parts|Vessels)/i).first()
      ).toBeVisible();
      await saveShot(page, `wow-${item.slug}-overview.png`);

      // Tab 2: Sources (+ Teardown Gallery)
      const sourcesBtn = page.getByRole('button', { name: /^Sources/i }).first();
      await sourcesBtn.click({ force: true });
      await page.waitForTimeout(600);
      const teardownGallery = page
        .getByTestId('teardown-gallery')
        .or(page.locator('section[aria-label*="Video Teardown" i]'))
        .first();
      await expect(teardownGallery).toBeVisible({ timeout: 10_000 });
      await saveShot(page, `wow-${item.slug}-sources.png`);

      // Tab 3: BOM (links, prices, savings)
      const bomBtn = page
        .locator('div.sticky button')
        .filter({ hasText: /^BOM/i })
        .first();
      await bomBtn.click({ force: true });
      await page.waitForTimeout(600);
      const retailerLinks = page.locator('a').filter({
        hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress|Buy at/i,
      });
      expect(await retailerLinks.count()).toBeGreaterThan(4);
      await saveShot(page, `wow-${item.slug}-bom.png`);

      // Tab 4: Print Files (STLs, plates, 3MF download, printer switch)
      const printBtn = page.getByRole('button', { name: /^Print Files/i }).first();
      await printBtn.click({ force: true });
      await page.waitForTimeout(600);
      const printerSelect = page
        .getByTestId('printer-select')
        .or(page.locator('#printer-select'))
        .first();
      await expect(printerSelect).toBeVisible({ timeout: 10_000 });
      await printerSelect.selectOption('prusa-mk4s', { force: true });
      await page.waitForTimeout(400);
      expect(await printerSelect.inputValue()).toBe('prusa-mk4s');
      await printerSelect.selectOption('bambu-a1', { force: true });
      await page.waitForTimeout(400);
      await saveShot(page, `wow-${item.slug}-print.png`);

      // Tab 5: Instructions (IKEA player with motions)
      const instrBtn = page.getByRole('button', { name: /^Instructions/i }).first();
      await instrBtn.click({ force: true });
      await page.waitForTimeout(900);
      const nextStepBtn = page.getByTestId('next-step-btn').first();
      if (await nextStepBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextStepBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
      await saveShot(page, `wow-${item.slug}-instructions.png`);

      // Tab 6: Exploded View (every part + explode slider)
      const explodedBtn = page
        .getByRole('button', { name: /^Exploded View/i })
        .first();
      await explodedBtn.click({ force: true });
      await page.waitForTimeout(1000);
      const explodeSlider = page
        .getByTestId('explode-slider')
        .or(page.locator('input[type="range"][aria-label*="Explode" i]'))
        .first();
      await expect(explodeSlider).toBeVisible({ timeout: 15_000 });
      await explodeSlider.evaluate((el) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        setter?.call(input, '0.65');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(500);
      const partChips = page.locator('[data-testid^="part-chip-"]');
      expect(await partChips.count()).toBe(item.totalParts);
      await partChips.first().click({ force: true });
      await page.waitForTimeout(400);
      await saveShot(page, `wow-${item.slug}-exploded.png`);

      // Ask Argon Modify verification (API / UI)
      const modRes = await request.post(
        `${BASE_URL}/api/projects/${item.slug}/modify`,
        {
          data: {
            prompt: 'use cheaper parts',
            forceDeterministic: true,
          },
        }
      );
      expect(modRes.status()).toBe(200);
      const modText = await modRes.text();
      expect(modText).toContain('"phase":"done"');
      expect(modText).toContain('diffSummary');
    });
  }
});
