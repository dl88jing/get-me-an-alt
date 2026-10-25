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
const MARKERS_FILE = path.join(__dirname, 'test-results', 'markers.json');

test.use({
  video: 'on',
  viewport: { width: 1920, height: 1080 },
});

async function pause(page: Page, ms: number): Promise<void> {
  const scaled = Math.max(50, Math.round(ms * PACE_SCALE));
  await page.waitForTimeout(scaled);
}

async function saveStepScreenshot(page: Page, name: string): Promise<void> {
  if (process.env.SAVE_STEP_SCREENSHOTS !== '1') {
    return;
  }
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      animations: 'allow',
      timeout: 3000,
    });
  } catch (err) {
    console.warn(`[demo.spec] Could not capture screenshot ${name}:`, err);
  }
}

let testStartMs = Date.now();
function elapsedSecNum(): number {
  return Number(((Date.now() - testStartMs) / 1000).toFixed(2));
}
function elapsedSec(): string {
  return ((Date.now() - testStartMs) / 1000).toFixed(1);
}

async function safeStep(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    console.log(`[demo.spec +${elapsedSec()}s] ==> START ${label}`);
    await fn();
    console.log(`[demo.spec +${elapsedSec()}s] <== DONE  ${label}`);
  } catch (err) {
    console.warn(
      `[demo.spec +${elapsedSec()}s] !!! SKIP "${label}":`,
      err instanceof Error ? err.message : err
    );
  }
}

async function smoothScrollTo(page: Page, y: number, pauseMs = 850): Promise<void> {
  try {
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }, y);
    await pause(page, pauseMs);
  } catch {
    // ignore scroll errors
  }
}

test.describe('Get Me An Alt — Full Story Screen Recording Walkthrough (v2)', () => {
  test('walks new landing -> Mission Control 9-agent DAG -> Critic -> BOM -> PrintPanel -> 3D IKEA & Exploded View', async ({
    page,
  }) => {
    testStartMs = Date.now();
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(MARKERS_FILE), { recursive: true });

    // Guard against unpatched BomItemCard({ bom, analysis, design }) in live Vercel chunk when PeerBomComp resolves BomItemCard first
    await page.route('**/_next/static/chunks/app/projects/**', async (route) => {
      try {
        const response = await route.fetch();
        const body = await response.text();
        const patched = body.replace(
          'let{item:t,currency:a="USD"}=e;return',
          'let{item:t,currency:a="USD"}=e;if(!t)return null;return'
        );
        await route.fulfill({ response, body: patched });
      } catch {
        await route.continue();
      }
    });

    const markers: Record<string, number> = {
      t0: 0,
      tNavStart: 8.5,
      tProjectLoaded: 10.5,
      tBomStart: 30.0,
      tPrintStart: 40.0,
      tThreeStart: 54.0,
      tEnd: 78.0,
    };

    // =========================================================================
    // 1. NEW LANDING HERO, GLASS COMMAND BAR & SCROLL STORY
    // =========================================================================
    await safeStep('1. Open New Landing Hero', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await pause(page, 1400);
      await saveStepScreenshot(page, '01-landing-hero');
    });

    await safeStep('2. Paste Product Link, Select Printer & Scroll Landing Story', async () => {
      const heroInput = page
        .getByPlaceholder(/Paste product link|describe a gadget/i)
        .first()
        .or(page.locator('input[type="text"]').first());

      if (await heroInput.isVisible({ timeout: 3500 }).catch(() => false)) {
        await heroInput
          .fill(
            'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
            { force: true }
          )
          .catch(() => {});
        await pause(page, 900);
      }

      // Inspect target printer dropdown on landing hero
      const landingPrinterSelect = page.locator('form select').first();
      if (
        await landingPrinterSelect.isVisible({ timeout: 2000 }).catch(() => false)
      ) {
        await landingPrinterSelect
          .selectOption('bambu-a1-mini', { force: true })
          .catch(() => {});
        await pause(page, 550);
        await landingPrinterSelect
          .selectOption('bambu-a1', { force: true })
          .catch(() => {});
        await pause(page, 550);
      }

      // Scroll through the new landing scroll story (7-stage strip, 3D explode, 83% savings)
      await smoothScrollTo(page, 620, 950);
      await smoothScrollTo(page, 1180, 1100);
      await saveStepScreenshot(page, '02-paste-product-link');
      await smoothScrollTo(page, 0, 750);
    });

    // =========================================================================
    // 2. OPEN DEMO PROJECT (Smart Plant Auto-Waterer)
    // =========================================================================
    markers.tNavStart = elapsedSecNum();
    await safeStep('3. Navigate to Smart Plant Auto-Waterer Project', async () => {
      await page.goto(`${BASE_URL}/projects/${DEMO_PROJECT_ID}`, {
        waitUntil: 'domcontentloaded',
      });
      markers.tProjectLoaded = elapsedSecNum();
      await pause(page, 2200);
    });

    // =========================================================================
    // 3. MISSION CONTROL: 9-AGENT DAG & CRITIC -> DESIGNER LOOP
    // =========================================================================
    await safeStep('4. Inspect Mission Control 9-Agent Graph & Critic Loop', async () => {
      const missionSection = page
        .locator('section[aria-label*="Mission Control"]')
        .first();

      if (await missionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await smoothScrollTo(page, 120, 800);

        // Click key agent node cards in Mission Control to showcase thoughts & artifacts
        const agentNodes = [
          /03\s*Teardown|Teardown/i,
          /05\s*Critic|Critic/i,
          /08\s*CAD|CAD/i,
          /09\s*Instructions|Instructions/i,
        ];

        for (const pattern of agentNodes) {
          const nodeBtn = missionSection
            .getByRole('button', { name: pattern })
            .first();
          if (await nodeBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
            await nodeBtn.click().catch(() => {});
            await pause(page, 800);
          }
        }
      }

      await saveStepScreenshot(page, '03-mission-control-timeline');
      await pause(page, 900);
    });

    // =========================================================================
    // 4. OVERVIEW TAB & PRINTABILITY CRITIC PANEL
    // =========================================================================
    await safeStep('5. Explore Overview Tab & Printability Critic Panel', async () => {
      const overviewTab = page
        .getByRole('button', { name: /^Overview/i })
        .first();
      if (await overviewTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await overviewTab.click();
        await pause(page, 1000);
      }

      // Scroll to show 7 Printed vs 5 Purchased split + CritiquePanel (2-round DFM verification)
      await smoothScrollTo(page, 680, 1200);
      await smoothScrollTo(page, 980, 1300);

      // Toggle Round 1 / Round 2 in CritiquePanel if buttons exist
      const round1Btn = page.getByRole('button', { name: /Round 1/i }).first();
      const round2Btn = page.getByRole('button', { name: /Round 2/i }).first();
      if (await round1Btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await round1Btn.click().catch(() => {});
        await pause(page, 800);
      }
      if (await round2Btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await round2Btn.click().catch(() => {});
        await pause(page, 800);
      }

      await saveStepScreenshot(page, '04-overview-tab');
    });

    // =========================================================================
    // 5. SOURCES & VIDEO TEARDOWN TAB
    // =========================================================================
    await safeStep('6. Explore Sources & Video Teardown Tab', async () => {
      await smoothScrollTo(page, 520, 600);
      const sourcesTab = page
        .getByRole('button', { name: /^Sources/i })
        .first();
      if (await sourcesTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await sourcesTab.click();
        await pause(page, 1400);
      }

      await smoothScrollTo(page, 720, 1100);

      const filterBar = page.locator('[aria-label="Filter sources by category"]');
      if (await filterBar.isVisible({ timeout: 800 }).catch(() => false)) {
        for (const filterName of [/Videos/i, /All/i]) {
          const chip = filterBar.getByRole('button', { name: filterName }).first();
          if (await chip.isVisible({ timeout: 800 }).catch(() => false)) {
            await chip.click({ timeout: 1200 }).catch(() => {});
            await pause(page, 700);
          }
        }
      }

      await smoothScrollTo(page, 920, 1100);
      await saveStepScreenshot(page, '05-sources-teardown-tab');
    });

    // =========================================================================
    // 6. BILL OF MATERIALS (BOM) & SAVINGS TAB ($149 -> $24.85, 83%)
    // =========================================================================
    markers.tBomStart = elapsedSecNum();
    await safeStep('7. Explore BOM & Retailer Links Tab', async () => {
      await smoothScrollTo(page, 520, 600);
      const bomTab = page.getByRole('button', { name: /^BOM/i }).first();
      if (await bomTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bomTab.click();
        await pause(page, 1600);
      }

      await smoothScrollTo(page, 720, 1400);

      // Hover retailer links (Amazon, Home Depot, Walmart, McMaster, AliExpress)
      const retailerLinks = page
        .locator('a')
        .filter({ hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress/i });
      const linkCount = await retailerLinks.count().catch(() => 0);
      for (let i = 0; i < Math.min(4, linkCount); i++) {
        await retailerLinks.nth(i).hover().catch(() => {});
        await pause(page, 650);
      }

      await smoothScrollTo(page, 1080, 1400);
      await saveStepScreenshot(page, '06-bom-savings-tab');
      await smoothScrollTo(page, 680, 1000);
    });

    // =========================================================================
    // 7. PRINT FILES TAB (PRINTPANEL, PRINTER DROPDOWN, PLATES, PRINT SERVICE)
    // =========================================================================
    markers.tPrintStart = elapsedSecNum();
    await safeStep(
      '8. Explore Print Files Tab: Switch Printer, View Plates & Print Service',
      async () => {
        await smoothScrollTo(page, 520, 600);
        const printTab = page
          .getByRole('button', { name: /^Print Files/i })
          .first();
        if (await printTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await printTab.click();
          await pause(page, 1600);
        }

        // Scroll to PrintPanel controls
        await smoothScrollTo(page, 920, 1100);

        const printerSelect = page
          .getByTestId('printer-select')
          .or(page.locator('#printer-select'))
          .first();

        if (
          await printerSelect.isVisible({ timeout: 2500 }).catch(() => false)
        ) {
          await printerSelect.scrollIntoViewIfNeeded().catch(() => {});
          await pause(page, 600);
          await printerSelect.selectOption('bambu-a1-mini').catch(() => {});
          await pause(page, 1400);
          await printerSelect.selectOption('prusa-mk4s').catch(() => {});
          await pause(page, 1300);
          await printerSelect.selectOption('bambu-a1').catch(() => {});
          await pause(page, 1300);
        }

        await smoothScrollTo(page, 1180, 1400);
        await saveStepScreenshot(page, '07-print-files-plates');

        // Interact with inline PrintPanel "No printer?" card
        const inlineNoPrinterCard = page
          .getByTestId('no-printer-card')
          .or(page.getByText(/No printer\? Get it printed/i))
          .first();

        if (
          await inlineNoPrinterCard
            .isVisible({ timeout: 2500 })
            .catch(() => false)
        ) {
          await inlineNoPrinterCard.scrollIntoViewIfNeeded().catch(() => {});
          await pause(page, 1100);

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
        }
      }
    );

    // =========================================================================
    // 8. INSTRUCTIONS TAB (THREE.JS IKEA-STYLE ANIMATED ASSEMBLY PLAYER)
    // =========================================================================
    markers.tThreeStart = elapsedSecNum();
    await safeStep(
      '9. Explore Instructions Tab & Play Three.js IKEA Assembly Player',
      async () => {
        await smoothScrollTo(page, 520, 600);
        const instructionsTab = page
          .getByRole('button', { name: /^Instructions/i })
          .first();
        if (
          await instructionsTab.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await instructionsTab.click();
          await pause(page, 1800);
        }

        const assemblyPlayer = page.getByTestId('assembly-player').first();
        if (
          await assemblyPlayer.isVisible({ timeout: 2500 }).catch(() => false)
        ) {
          await assemblyPlayer.scrollIntoViewIfNeeded().catch(() => {});
        } else {
          await smoothScrollTo(page, 680, 900);
        }

        const playPauseBtn = page
          .getByTestId('play-pause-btn')
          .or(page.getByRole('button', { name: /▶ Play|⏸ Pause/i }))
          .first();

        if (
          await playPauseBtn.isVisible({ timeout: 2500 }).catch(() => false)
        ) {
          const txt = (await playPauseBtn.textContent()) || '';
          if (txt.includes('Play')) {
            await playPauseBtn.click().catch(() => {});
          }
          await pause(page, 2800);

          const nextStepBtn = page.getByTestId('next-step-btn').first();
          if (
            await nextStepBtn.isVisible({ timeout: 1500 }).catch(() => false)
          ) {
            for (let s = 0; s < 3; s++) {
              await nextStepBtn.click().catch(() => {});
              await pause(page, 1400);
            }
          }
        }

        await saveStepScreenshot(page, '09-instructions-ikea-player');
      }
    );

    // =========================================================================
    // 9. EXPLODED VIEW TAB (THREE.JS 3D VIEW, 11 PARTS, SLIDER, ORBIT, CALLOUTS)
    // =========================================================================
    await safeStep(
      '10. Explore Exploded View Tab: Drag Explode Slider, Orbit 3D & Click Parts',
      async () => {
        await smoothScrollTo(page, 520, 600);
        const explodedTab = page
          .getByRole('button', { name: /^Exploded View/i })
          .first();
        if (await explodedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
          await explodedTab.click();
          await pause(page, 1800);
        }

        const explodedView = page.getByTestId('exploded-view').first();
        if (await explodedView.isVisible({ timeout: 2500 }).catch(() => false)) {
          await explodedView.scrollIntoViewIfNeeded().catch(() => {});
        } else {
          await smoothScrollTo(page, 680, 900);
        }

        // 1) Adjust explode slider in Three.js ExplodedView
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

        const fullExplodeBtn = page
          .getByRole('button', { name: /Full Explode/i })
          .first();
        if (
          await fullExplodeBtn.isVisible({ timeout: 1500 }).catch(() => false)
        ) {
          await fullExplodeBtn.click().catch(() => {});
          await pause(page, 1100);
        }

        // 2) Orbit 3D canvas
        const canvas = page.locator('canvas').first();
        if (await canvas.isVisible({ timeout: 2000 }).catch(() => false)) {
          const box = await canvas.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            const startX = box.x + box.width * 0.45;
            const startY = box.y + box.height * 0.45;
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            for (let step = 1; step <= 14; step++) {
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

        // 3) Click part chips to highlight 3D mesh & inspect BOM/dims
        const partChips = page.locator('[data-testid^="part-chip-"]');
        const chipCount = await partChips.count().catch(() => 0);
        for (const idx of [0, 2, 7]) {
          if (idx < chipCount) {
            await partChips.nth(idx).click().catch(() => {});
            await pause(page, 1200);
          }
        }

        await saveStepScreenshot(page, '10-exploded-3d-view');
        await pause(page, 2000);
      }
    );

    markers.tEnd = elapsedSecNum();
    try {
      fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2));
      console.log('[demo.spec] Wrote timing markers:', JSON.stringify(markers));
    } catch (err) {
      console.warn('[demo.spec] Could not write markers.json:', err);
    }
  });
});
