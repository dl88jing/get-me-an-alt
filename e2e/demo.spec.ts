import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (process.env.BASE_URL || 'https://get-me-an-alt.vercel.app').replace(
  /\/+$/,
  ''
);
const DEMO_PROJECT_ID = process.env.DEMO_PROJECT_ID || 'plant-auto-waterer';
const PACE_SCALE = Number(process.env.DEMO_PACE_SCALE ?? 1);
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

test.use({
  video: 'on',
  viewport: { width: 1920, height: 1080 },
});

async function pause(page: Page, ms: number): Promise<void> {
  const scaled = Math.max(50, Math.round(ms * PACE_SCALE));
  await page.waitForTimeout(scaled);
}

async function saveStepScreenshot(page: Page, name: string): Promise<void> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      animations: 'allow',
      timeout: 10000,
    });
  } catch (err) {
    console.warn(`[demo.spec] Could not capture screenshot ${name}:`, err);
  }
}

async function safeStep(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    console.log(`[demo.spec] ==> ${label}`);
    await fn();
  } catch (err) {
    console.warn(
      `[demo.spec] Skipping non-critical step "${label}":`,
      err instanceof Error ? err.message : err
    );
  }
}

async function smoothScrollTo(page: Page, y: number, pauseMs = 900): Promise<void> {
  try {
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }, y);
    await pause(page, pauseMs);
  } catch {
    // ignore scroll errors
  }
}

test.describe('Get Me An Alt — Full Story Screen Recording Walkthrough', () => {
  test('walks landing -> demo project -> agent timeline -> 6 tabs with deliberate pacing', async ({
    page,
  }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // =========================================================================
    // 1. LANDING HERO & PRODUCT LINK INPUT
    // =========================================================================
    await safeStep('1. Open Landing Hero', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await pause(page, 1800);
      await saveStepScreenshot(page, '01-landing-hero');
    });

    await safeStep('2. Paste Product Link & Inspect Target Printer', async () => {
      const heroInput = page
        .getByPlaceholder(/Paste product link|describe a gadget/i)
        .first()
        .or(page.locator('input[type="text"]').first());

      if (await heroInput.isVisible({ timeout: 4000 }).catch(() => false)) {
        await heroInput.click();
        await heroInput.fill(
          'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir'
        );
        await pause(page, 1200);
      }

      // Inspect target printer dropdown on landing hero if present
      const landingPrinterSelect = page.locator('form select').first();
      if (
        await landingPrinterSelect.isVisible({ timeout: 2500 }).catch(() => false)
      ) {
        await landingPrinterSelect
          .selectOption('bambu-a1-mini')
          .catch(() => {});
        await pause(page, 700);
        await landingPrinterSelect.selectOption('bambu-a1').catch(() => {});
        await pause(page, 700);
      }

      await smoothScrollTo(page, 380, 1200);
      await saveStepScreenshot(page, '02-paste-product-link');
      await smoothScrollTo(page, 0, 900);
    });

    // =========================================================================
    // 2. OPEN DEMO PROJECT (Smart Plant Auto-Waterer)
    // =========================================================================
    await safeStep('3. Navigate to Demo Project', async () => {
      const demoLink = page
        .getByRole('link', {
          name: /Instant Demo Mode|Smart Plant Auto-Waterer/i,
        })
        .first();
      const presetBtn = page
        .getByRole('button', { name: /Smart Plant Auto-Waterer/i })
        .first();

      if (await demoLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await demoLink.click();
      } else if (
        await presetBtn.isVisible({ timeout: 3000 }).catch(() => false)
      ) {
        await presetBtn.click();
      } else {
        await page.goto(`${BASE_URL}/projects/${DEMO_PROJECT_ID}`, {
          waitUntil: 'domcontentloaded',
        });
      }

      await page
        .waitForURL(/\/projects\//, { timeout: 10000 })
        .catch(async () => {
          await page.goto(`${BASE_URL}/projects/${DEMO_PROJECT_ID}`, {
            waitUntil: 'domcontentloaded',
          });
        });

      await pause(page, 2200);
    });

    // =========================================================================
    // 3. MISSION CONTROL / LIVE AGENT TIMELINE
    // =========================================================================
    await safeStep('4. Inspect Mission Control & 6-Stage Agent Timeline', async () => {
      const stageNames = [
        /Analyst/i,
        /Researcher/i,
        /Designer/i,
        /BOM/i,
        /CAD/i,
        /Instructions/i,
      ];

      for (const stagePattern of stageNames) {
        const stageBtn = page
          .locator('section')
          .filter({ hasText: /Managed Agent Pipeline|Mission Control/i })
          .getByRole('button', { name: stagePattern })
          .first()
          .or(page.getByRole('button', { name: stagePattern }).first());

        if (await stageBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await stageBtn.click().catch(() => {});
          await pause(page, 850);
        }
      }

      await saveStepScreenshot(page, '03-mission-control-timeline');
      await pause(page, 1200);
    });

    // =========================================================================
    // 4. OVERVIEW TAB
    // =========================================================================
    await safeStep('5. Explore Overview Tab', async () => {
      const overviewTab = page
        .getByRole('button', { name: /^Overview/i })
        .first();
      if (await overviewTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await overviewTab.click();
        await pause(page, 1400);
      }

      await smoothScrollTo(page, 420, 1400);
      await saveStepScreenshot(page, '04-overview-tab');
      await smoothScrollTo(page, 220, 900);
    });

    // =========================================================================
    // 5. SOURCES & VIDEO TEARDOWN TAB
    // =========================================================================
    await safeStep('6. Explore Sources & Video Teardown Tab', async () => {
      const sourcesTab = page
        .getByRole('button', { name: /^Sources/i })
        .first();
      if (await sourcesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sourcesTab.click();
        await pause(page, 1800);
      }

      // If TeardownGallery frames exist, click through a couple of frame tabs
      const teardownTabs = page
        .locator('[aria-label="Teardown video frames"] [role="tab"]');
      const frameCount = await teardownTabs.count().catch(() => 0);
      if (frameCount > 1) {
        await teardownTabs.nth(1).click().catch(() => {});
        await pause(page, 1100);
        if (frameCount > 2) {
          await teardownTabs.nth(2).click().catch(() => {});
          await pause(page, 1100);
        }
      }

      // Filter chips in SourcesTab if present
      const filterBar = page.locator('[aria-label="Filter sources by category"]');
      if (await filterBar.isVisible({ timeout: 800 }).catch(() => false)) {
        for (const filterName of [/Videos/i, /Open Designs/i, /All Sources/i]) {
          const chip = filterBar.getByRole('button', { name: filterName }).first();
          if (await chip.isVisible({ timeout: 800 }).catch(() => false)) {
            await chip.click({ timeout: 1500 }).catch(() => {});
            await pause(page, 800);
          }
        }
      }

      await smoothScrollTo(page, 480, 1500);
      await saveStepScreenshot(page, '05-sources-teardown-tab');
      await smoothScrollTo(page, 220, 900);
    });

    // =========================================================================
    // 6. BILL OF MATERIALS (BOM) & SAVINGS TAB
    // =========================================================================
    await safeStep('7. Explore BOM & Retailer Links Tab', async () => {
      const bomTab = page.getByRole('button', { name: /^BOM/i }).first();
      if (await bomTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bomTab.click();
        await pause(page, 1800);
      }

      await smoothScrollTo(page, 420, 1400);

      // Hover a couple of retailer links (Amazon, Home Depot, McMaster)
      const retailerLinks = page
        .locator('a')
        .filter({ hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress/i });
      const linkCount = await retailerLinks.count().catch(() => 0);
      for (let i = 0; i < Math.min(3, linkCount); i++) {
        await retailerLinks.nth(i).hover().catch(() => {});
        await pause(page, 650);
      }

      await saveStepScreenshot(page, '06-bom-savings-tab');
      await smoothScrollTo(page, 220, 900);
    });

    // =========================================================================
    // 7. PRINT FILES TAB (PRINTER DROPDOWN, PLATES, PRINT-SERVICE CARD)
    // =========================================================================
    await safeStep(
      '8. Explore Print Files Tab: Switch Printer, View Plates & Print Service',
      async () => {
        const printTab = page
          .getByRole('button', { name: /^Print Files/i })
          .first();
        if (await printTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await printTab.click();
          await pause(page, 1800);
        }

        // Switch printer in dropdown if PrintPanel selector is mounted
        const printerSelect = page
          .getByTestId('printer-select')
          .or(page.locator('#printer-select'))
          .first();

        if (
          await printerSelect.isVisible({ timeout: 2500 }).catch(() => false)
        ) {
          await printerSelect.selectOption('bambu-a1-mini').catch(() => {});
          await pause(page, 1400);
          await printerSelect.selectOption('prusa-mk4s').catch(() => {});
          await pause(page, 1400);
          await printerSelect.selectOption('bambu-a1').catch(() => {});
          await pause(page, 1400);
        }

        await smoothScrollTo(page, 450, 1400);
        await saveStepScreenshot(page, '07-print-files-plates');

        // Interact with either inline PrintPanel "No printer?" card or modal trigger
        const inlineNoPrinterCard = page
          .getByTestId('no-printer-card')
          .or(page.getByText(/No printer\? Get it printed/i))
          .first();

        if (
          await inlineNoPrinterCard
            .isVisible({ timeout: 2000 })
            .catch(() => false)
        ) {
          await inlineNoPrinterCard.scrollIntoViewIfNeeded().catch(() => {});
          await pause(page, 1200);

          const jlcBtn = page
            .getByTestId('service-option-jlc3dp')
            .or(page.getByRole('button', { name: /JLC3DP/i }))
            .first();
          if (await jlcBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await jlcBtn.click().catch(() => {});
            await pause(page, 1000);
          }

          const craftcloudBtn = page
            .getByTestId('service-option-craftcloud')
            .or(page.getByRole('button', { name: /Craftcloud/i }))
            .first();
          if (
            await craftcloudBtn.isVisible({ timeout: 1500 }).catch(() => false)
          ) {
            await craftcloudBtn.click().catch(() => {});
            await pause(page, 1000);
          }

          await saveStepScreenshot(page, '08-print-service-quote');
        } else {
          // Fallback modal in app/projects/[id]/page.tsx
          const orderModalTrigger = page
            .getByRole('button', {
              name: /No Printer\? Order Prints|Request Print Bureau Quote/i,
            })
            .first();

          if (
            await orderModalTrigger
              .isVisible({ timeout: 2500 })
              .catch(() => false)
          ) {
            await orderModalTrigger.click();
            await pause(page, 1400);

            const jlcLabel = page
              .getByText(/JLC3DP Factory Direct/i)
              .first();
            if (
              await jlcLabel.isVisible({ timeout: 1500 }).catch(() => false)
            ) {
              await jlcLabel.click({ timeout: 2000 }).catch(() => {});
              await pause(page, 1200);
            }

            const xometryLabel = page
              .getByText(/Xometry Express/i)
              .first();
            if (
              await xometryLabel.isVisible({ timeout: 1500 }).catch(() => false)
            ) {
              await xometryLabel.click({ timeout: 2000 }).catch(() => {});
              await pause(page, 1000);
            }

            await saveStepScreenshot(page, '08-print-service-quote');

            const closeBtn = page
              .getByRole('button', { name: /Close/i })
              .first();
            if (
              await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)
            ) {
              await closeBtn.click({ timeout: 2000 }).catch(() => {});
              await pause(page, 900);
            }
          }
        }

        await smoothScrollTo(page, 220, 900);
      }
    );

    // =========================================================================
    // 8. INSTRUCTIONS TAB (PLAY IKEA-STYLE PLAYER)
    // =========================================================================
    await safeStep(
      '9. Explore Instructions Tab & Play IKEA-Style Assembly Player',
      async () => {
        const instructionsTab = page
          .getByRole('button', { name: /^Instructions/i })
          .first();
        if (
          await instructionsTab.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await instructionsTab.click();
          await pause(page, 1800);
        }

        await smoothScrollTo(page, 380, 1000);

        // If Three.js AssemblyPlayer is mounted
        const playPauseBtn = page
          .getByTestId('play-pause-btn')
          .or(page.getByRole('button', { name: /▶ Play|⏸ Pause/i }))
          .first();

        if (
          await playPauseBtn.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          const txt = (await playPauseBtn.textContent()) || '';
          if (txt.includes('Play')) {
            await playPauseBtn.click().catch(() => {});
          }
          await pause(page, 3200);

          const nextStepBtn = page.getByTestId('next-step-btn').first();
          if (
            await nextStepBtn.isVisible({ timeout: 1500 }).catch(() => false)
          ) {
            await nextStepBtn.click().catch(() => {});
            await pause(page, 1400);
            await nextStepBtn.click().catch(() => {});
            await pause(page, 1400);
          }
        } else {
          // Built-in step player in app/projects/[id]/page.tsx
          const nextBtn = page
            .getByRole('button', { name: /Next Step/i })
            .first();
          for (let step = 0; step < 4; step++) {
            if (
              (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) &&
              (await nextBtn.isEnabled().catch(() => false))
            ) {
              await nextBtn.click().catch(() => {});
              await pause(page, 1200);
            }
          }
        }

        await saveStepScreenshot(page, '09-instructions-ikea-player');
        await smoothScrollTo(page, 220, 900);
      }
    );

    // =========================================================================
    // 9. EXPLODED VIEW TAB (DRAG EXPLODE SLIDER, ORBIT, CLICK A PART)
    // =========================================================================
    await safeStep(
      '10. Explore Exploded View Tab: Drag Explode Slider, Orbit & Click Part',
      async () => {
        const explodedTab = page
          .getByRole('button', { name: /^Exploded View/i })
          .first();
        if (await explodedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await explodedTab.click();
          await pause(page, 1800);
        }

        await smoothScrollTo(page, 380, 1000);

        // 1) Drag/adjust explode slider if ExplodedView is mounted
        const explodeSlider = page
          .getByTestId('explode-slider')
          .or(page.locator('input[type="range"][aria-label*="Explode" i]'))
          .first();

        if (
          await explodeSlider.isVisible({ timeout: 2500 }).catch(() => false)
        ) {
          for (const val of ['0.35', '0.75', '1', '0.55']) {
            await explodeSlider.fill(val).catch(async () => {
              await explodeSlider.evaluate((el, v) => {
                const input = el as HTMLInputElement;
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  'value'
                )?.set;
                nativeInputValueSetter?.call(input, v);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }, val);
            });
            await pause(page, 900);
          }
        }

        // Preset buttons if present ("Full Explode (100%)", "45%")
        const fullExplodeBtn = page
          .getByRole('button', { name: /Full Explode/i })
          .first();
        if (
          await fullExplodeBtn.isVisible({ timeout: 1500 }).catch(() => false)
        ) {
          await fullExplodeBtn.click().catch(() => {});
          await pause(page, 1200);
        }

        // 2) Orbit 3D canvas if present
        const canvas = page.locator('canvas').first();
        if (await canvas.isVisible({ timeout: 2000 }).catch(() => false)) {
          const box = await canvas.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const startX = box.x + box.width * 0.45;
            const startY = box.y + box.height * 0.45;
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            for (let step = 1; step <= 12; step++) {
              await page.mouse.move(
                startX + step * 14,
                startY - step * 4
              );
              await page.waitForTimeout(45);
            }
            await page.mouse.up();
            await pause(page, 1200);
          }
        }

        // 3) Click a part chip or part card to highlight & inspect BOM/dims
        const partChips = page.locator('[data-testid^="part-chip-"]');
        const chipCount = await partChips.count().catch(() => 0);
        if (chipCount > 0) {
          await partChips.nth(0).click().catch(() => {});
          await pause(page, 1200);
          if (chipCount > 2) {
            await partChips.nth(2).click().catch(() => {});
            await pause(page, 1200);
          }
        }

        // Also click part cards in the assembly graph grid
        const partCards = page
          .locator('button')
          .filter({ hasText: /dims:.*shape:/i });
        const cardCount = await partCards.count().catch(() => 0);
        for (let i = 0; i < Math.min(4, cardCount); i++) {
          await partCards.nth(i).click({ timeout: 2000 }).catch(() => {});
          await pause(page, 1400);
        }

        await smoothScrollTo(page, 520, 1600);
        await saveStepScreenshot(page, '10-exploded-3d-view');
        await smoothScrollTo(page, 220, 1600);
        await pause(page, 2500);
      }
    );
  });
});
