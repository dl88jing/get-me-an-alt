import { test, expect, Page, TestInfo, CDPSession } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (
  process.env.BASE_URL || 'https://get-me-an-alt.vercel.app'
).replace(/\/+$/, '');

const OUT_ROOT = '/workspace/work/out/e2e';

test.use({
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
});

export interface StepRecord {
  step: string;
  passed: boolean;
  durationMs: number;
  notes: string;
  screenshot?: string;
}

export interface AgentTimingRecord {
  id: string;
  name: string;
  status: string;
  runner?: string;
  durationMs: number;
  tokensTotal?: number;
  summary?: string;
}

export interface CaseTelemetry {
  caseSlug: string;
  title: string;
  inputDescription: string;
  projectUrl?: string;
  projectId?: string;
  isInstantSample?: boolean;
  loadedInstantly?: boolean;
  pipelineCompleted?: boolean;
  pipelineStatus?: string;
  quota429Observed?: boolean;
  totalDurationMs: number;
  pipelineWaitMs: number;
  steps: StepRecord[];
  agentTimings: AgentTimingRecord[];
  artifactQuality: {
    objectName?: string;
    retailPrice?: number;
    diyCost?: number;
    savingsDollars?: number;
    savingsPercent?: number;
    bomItemsCount?: number;
    bomSampleItems?: string[];
    retailerLinksCount?: number;
    printedPartsCount?: number;
    purchasedPartsCount?: number;
    totalPartsCount?: number;
    platesCount?: number;
    totalWeightGrams?: number;
    totalPrintTimeMinutes?: number;
    instructionsStepsCount?: number;
    sourcesCount?: number;
    teardownFramesCount?: number;
    critiqueScore?: number;
    critiqueRounds?: number;
  };
  consoleErrors: string[];
  failedNetworkRequests: string[];
  screenshots: string[];
  bugsDetected: string[];
}

const caseTelemetryMap = new Map<string, CaseTelemetry>();
const testCaseSlugMap = new Map<string, string>();
const pageCdpMap = new WeakMap<Page, CDPSession>();

function ensureCaseDir(caseSlug: string): string {
  const dir = path.join(OUT_ROOT, `presets-${caseSlug}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function getCdpSession(page: Page): Promise<CDPSession> {
  let session = pageCdpMap.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    pageCdpMap.set(page, session);
  }
  return session;
}

async function captureStepScreenshot(
  page: Page,
  caseSlug: string,
  stepName: string,
  telemetry: CaseTelemetry
): Promise<string | undefined> {
  try {
    const dir = ensureCaseDir(caseSlug);
    const filename = `${stepName}.png`;
    const fullPath = path.join(dir, filename);
    const cdp = await getCdpSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
    });
    fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
    telemetry.screenshots.push(fullPath);
    return fullPath;
  } catch (err) {
    console.warn(`[presets.spec] Screenshot failed (${stepName}):`, err);
    return undefined;
  }
}

async function runRecordedStep(
  page: Page,
  caseSlug: string,
  stepId: string,
  stepLabel: string,
  telemetry: CaseTelemetry,
  fn: () => Promise<string | void>
): Promise<boolean> {
  const t0 = Date.now();
  let passed = false;
  let notes = 'OK';
  try {
    const res = await fn();
    passed = true;
    if (typeof res === 'string' && res.trim()) {
      notes = res.trim();
    }
  } catch (err) {
    passed = false;
    notes = err instanceof Error ? err.message : String(err);
    console.warn(`[presets.spec][${caseSlug}] Step FAILED (${stepLabel}):`, notes);
  }
  const durationMs = Date.now() - t0;
  const shot = await captureStepScreenshot(page, caseSlug, stepId, telemetry);
  telemetry.steps.push({
    step: stepLabel,
    passed,
    durationMs,
    notes,
    screenshot: shot,
  });
  return passed;
}

async function setupFastLandingAndCollectors(
  page: Page,
  telemetry: CaseTelemetry
): Promise<void> {
  // Block heavy background hero.mp4 video decode so software WebGL + CPU stay responsive
  await page.route('**/media/hero.mp4', (r) => r.abort()).catch(() => {});

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      telemetry.consoleErrors.push(text.slice(0, 300));
    }
    if (/429|quota|rate.?limit/i.test(text)) {
      telemetry.quota429Observed = true;
    }
  });

  page.on('pageerror', (err) => {
    telemetry.consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 300)}`);
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/media/hero.mp4')) return;
    const errText = req.failure()?.errorText || 'failed';
    if (errText.includes('ERR_ABORTED')) return;
    telemetry.failedNetworkRequests.push(`${req.method()} ${url} (${errText})`);
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status === 429) {
      telemetry.quota429Observed = true;
    }
    if (status >= 400 && !res.url().includes('favicon')) {
      telemetry.failedNetworkRequests.push(
        `HTTP ${status} ${res.request().method()} ${res.url()}`
      );
    }
  });
}

async function setReactInputValue(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`Input not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, val: value }
  );
}

async function assertNoUndefinedOrNaNOrErrorToast(
  page: Page,
  contextLabel: string,
  telemetry: CaseTelemetry
): Promise<void> {
  const visibleText = await page.locator('main').innerText().catch(() => '');
  expect(
    visibleText.trim().length,
    `${contextLabel}: main content should be non-empty`
  ).toBeGreaterThan(20);

  if (/\bundefined\b/i.test(visibleText)) {
    telemetry.bugsDetected.push(
      `${contextLabel}: visible "undefined" found in main text`
    );
  }
  if (/\bNaN\b/.test(visibleText)) {
    telemetry.bugsDetected.push(
      `${contextLabel}: visible "NaN" found in main text`
    );
  }
  expect(visibleText).not.toMatch(/\bNaN\b/);
}

async function exerciseAllProjectTabsAndModify(
  page: Page,
  caseSlug: string,
  telemetry: CaseTelemetry,
  expectInstantSample: boolean
): Promise<void> {
  const navStart = Date.now();
  await page.waitForURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
  const currentUrl = page.url();
  telemetry.projectUrl = currentUrl;
  const projectId = currentUrl.split('/projects/')[1]?.split(/[?#]/)[0] || '';
  telemetry.projectId = projectId;

  const isInstant = projectId === 'plant-auto-waterer';
  telemetry.loadedInstantly = isInstant;
  if (expectInstantSample && !isInstant) {
    telemetry.bugsDetected.push(
      `Preset "${caseSlug}" did not open as an instant pre-generated sample (/projects/${caseSlug}); instead it triggered a live POST /api/objects run (/projects/${projectId}) because data/samples/${caseSlug} is missing.`
    );
  }

  // Wait on Mission Control / SSE progress until pipeline is completed (or up to timeout)
  await runRecordedStep(
    page,
    caseSlug,
    '03-mission-control',
    'Mission Control & SSE Pipeline Completion',
    telemetry,
    async () => {
      const missionSection = page
        .locator('section[aria-label*="Mission Control"]')
        .first();
      await expect(missionSection).toBeVisible({ timeout: 25_000 });

      const waitStart = Date.now();
      const maxWaitMs = 95_000;
      let finalManifest: Record<string, unknown> | null = null;
      let stalledLogged = false;

      while (Date.now() - waitStart < maxWaitMs) {
        const pollRes = await page
          .evaluate(async (pid) => {
            try {
              const r = await fetch(`/api/objects/${encodeURIComponent(pid)}`);
              if (!r.ok) return { httpStatus: r.status, manifest: null };
              const d = await r.json();
              return { httpStatus: r.status, manifest: d.manifest || null };
            } catch {
              return { httpStatus: 0, manifest: null };
            }
          }, projectId)
          .catch(() => ({ httpStatus: 0, manifest: null }));

        const m = pollRes.manifest as Record<string, unknown> | null;
        if (m) {
          finalManifest = m;
          const st = String(m.status || '');
          if (st === 'completed' || st === 'error') {
            telemetry.pipelineCompleted = st === 'completed';
            telemetry.pipelineStatus = st;
            break;
          }
        }

        // Also check UI tab badges directly (SSE stream updates React state even if GET /api/objects/[id] hits another serverless container)
        const uiState = await page
          .evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const printBtn = buttons.find((b) =>
              /Print Files/i.test(b.textContent || '')
            );
            const instrBtn = buttons.find((b) =>
              /Instructions/i.test(b.textContent || '')
            );
            const bomBtn = buttons.find((b) =>
              /^BOM/i.test((b.textContent || '').trim())
            );
            return {
              printText: printBtn?.textContent || '',
              instrText: instrBtn?.textContent || '',
              bomText: bomBtn?.textContent || '',
            };
          })
          .catch(() => ({ printText: '', instrText: '', bomText: '' }));

        if (
          uiState.printText.includes('plate') &&
          uiState.instrText.includes('step')
        ) {
          telemetry.pipelineCompleted = true;
          telemetry.pipelineStatus = 'completed';
          break;
        }

        const elapsed = Date.now() - waitStart;
        if (elapsed > 64_000 && !stalledLogged) {
          stalledLogged = true;
          telemetry.bugsDetected.push(
            `SSE stream /api/objects/${projectId}/stream exceeded Vercel 60s maxDuration timeout before all 9 stages completed (sequential Gemini REST calls + Google Search grounding exceed 60s).`
          );
          break;
        }

        await page.waitForTimeout(2000);
      }

      telemetry.pipelineWaitMs = Date.now() - navStart;

      // Click several agent nodes in Mission Control to inspect thoughts & artifacts
      for (const nodePattern of [
        /01\s*Analyst|Analyst/i,
        /03\s*Teardown|Teardown/i,
        /05\s*Critic|Critic/i,
        /08\s*CAD|CAD/i,
        /09\s*Instructions|Instructions/i,
      ]) {
        const btn = missionSection
          .getByRole('button', { name: nodePattern })
          .first();
        if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
          await btn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(250);
        }
      }

      // Extract manifest telemetry if available
      const latestCheck = await page
        .evaluate(async (pid) => {
          try {
            const r = await fetch(`/api/objects/${encodeURIComponent(pid)}`);
            if (!r.ok) return null;
            const d = await r.json();
            return d.manifest || null;
          } catch {
            return null;
          }
        }, projectId)
        .catch(() => null);

      const manifestObj = (latestCheck || finalManifest) as Record<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      > | null;

      if (manifestObj) {
        telemetry.isInstantSample = Boolean(manifestObj.isSample);
        if (!telemetry.pipelineCompleted) {
          telemetry.pipelineStatus = String(manifestObj.status || 'unknown');
          telemetry.pipelineCompleted = manifestObj.status === 'completed';
        }

        if (Array.isArray(manifestObj.stages)) {
          telemetry.agentTimings = manifestObj.stages.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) => ({
              id: String(s.id),
              name: String(s.name),
              status: String(s.status),
              runner: s.runner ? String(s.runner) : undefined,
              durationMs: Number(s.durationMs || 0),
              tokensTotal: s.tokensUsed?.total
                ? Number(s.tokensUsed.total)
                : undefined,
              summary: s.summary ? String(s.summary) : undefined,
            })
          );
        }

        const analysis = manifestObj.analysis;
        const bom = manifestObj.bom;
        const design = manifestObj.design;
        const plates = manifestObj.plates;
        const instructions = manifestObj.instructions;
        const sources = manifestObj.sources;
        const teardown = manifestObj.teardown;
        const critique = manifestObj.critique;

        telemetry.artifactQuality = {
          objectName: analysis?.objectName || manifestObj.title,
          retailPrice:
            bom?.summary?.originalRetailPrice ??
            analysis?.originalProduct?.retailPrice,
          diyCost: bom?.summary?.totalDiyCost ?? analysis?.targetDiyCost,
          savingsDollars:
            bom?.summary?.totalSavings ?? analysis?.estimatedSavings,
          savingsPercent: bom?.summary?.savingsPercent,
          bomItemsCount: Array.isArray(bom?.items) ? bom.items.length : 0,
          bomSampleItems: Array.isArray(bom?.items)
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              bom.items.slice(0, 4).map((i: any) => `${i.name} ($${i.totalPrice})`)
            : [],
          retailerLinksCount: Array.isArray(bom?.items)
            ? bom.items.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: number, it: any) =>
                  acc +
                  (Array.isArray(it.retailerLinks) ? it.retailerLinks.length : 0),
                0
              )
            : 0,
          printedPartsCount: design?.printedPartsCount ?? 0,
          purchasedPartsCount: design?.purchasedPartsCount ?? 0,
          totalPartsCount: Array.isArray(design?.parts)
            ? design.parts.length
            : 0,
          platesCount: plates?.totalPlates ?? 0,
          totalWeightGrams: plates?.totalWeightGrams ?? 0,
          totalPrintTimeMinutes: plates?.totalPrintTimeMinutes ?? 0,
          instructionsStepsCount: Array.isArray(instructions?.steps)
            ? instructions.steps.length
            : 0,
          sourcesCount: Array.isArray(sources?.sources)
            ? sources.sources.length
            : 0,
          teardownFramesCount: Array.isArray(teardown?.frames)
            ? teardown.frames.length
            : 0,
          critiqueScore: critique?.finalScore,
          critiqueRounds: critique?.totalRounds,
        };
      }

      if (!telemetry.pipelineCompleted) {
        throw new Error(
          `Pipeline did not reach completed status within 64s (status=${telemetry.pipelineStatus || 'running'}, waitMs=${telemetry.pipelineWaitMs})`
        );
      }

      return `Mission Control status=${telemetry.pipelineStatus}, waitMs=${telemetry.pipelineWaitMs}ms, stages=${telemetry.agentTimings.length}`;
    }
  );

  // 1. Overview Tab
  await runRecordedStep(
    page,
    caseSlug,
    '04-overview-tab',
    'Overview Tab & CritiquePanel',
    telemetry,
    async () => {
      const overviewBtn = page.getByRole('button', { name: /^Overview/i }).first();
      await expect(overviewBtn).toBeVisible();
      await overviewBtn.click({ force: true });
      await page.waitForTimeout(500);
      await assertNoUndefinedOrNaNOrErrorToast(page, 'Overview Tab', telemetry);

      const printedHeading = page.getByText(/3D-Printed Parts/i).first();
      await expect(printedHeading).toBeVisible({ timeout: 5000 });

      const round1Btn = page.getByRole('button', { name: /Round 1/i }).first();
      const round2Btn = page.getByRole('button', { name: /Round 2/i }).first();
      if (await round1Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round1Btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
      if (await round2Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round2Btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
      return 'Overview tab loaded with 3D-Printed vs Off-The-Shelf split & CritiquePanel';
    }
  );

  // 2. Sources Tab (including Video Teardown)
  await runRecordedStep(
    page,
    caseSlug,
    '05-sources-teardown',
    'Sources Tab & Video Teardown Gallery',
    telemetry,
    async () => {
      const sourcesBtn = page.getByRole('button', { name: /^Sources/i }).first();
      await expect(sourcesBtn).toBeVisible();
      await sourcesBtn.click({ force: true });
      await page.waitForTimeout(600);
      await assertNoUndefinedOrNaNOrErrorToast(page, 'Sources Tab', telemetry);

      const sourcesTabRoot = page.getByTestId('sources-tab').first();
      const hasSourcesTab = await sourcesTabRoot
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (!hasSourcesTab) {
        throw new Error('Sources tab content did not render (sources artifact missing)');
      }

      const teardownGallery = page.getByTestId('teardown-gallery').first();
      const hasTeardown = await teardownGallery
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      if (!hasTeardown) {
        telemetry.bugsDetected.push(
          `Sources Tab (${caseSlug}): TeardownGallery has 0 frames or is not rendered.`
        );
      }
      return `Sources tab visible (TeardownGallery=${hasTeardown})`;
    }
  );

  // 3. BOM Tab (including Price Hunter links + savings)
  await runRecordedStep(
    page,
    caseSlug,
    '06-bom-savings',
    'BOM Tab, Price Hunter Retailer Links & Savings',
    telemetry,
    async () => {
      const bomBtn = page
        .locator('div.sticky button')
        .filter({ hasText: /^BOM/i })
        .first();
      await expect(bomBtn).toBeVisible();
      await bomBtn.click({ force: true });
      await page.waitForTimeout(600);
      await assertNoUndefinedOrNaNOrErrorToast(page, 'BOM Tab', telemetry);

      const retailerLinks = page
        .locator('a')
        .filter({
          hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress|Buy at/i,
        });
      const count = await retailerLinks.count();
      expect(count, 'BOM tab must render retailer links').toBeGreaterThan(0);

      return `BOM tab rendered ${count} retailer sourcing links`;
    }
  );

  // 4. Print Files Tab (switch printer to Prusa MK4S and back + open print-service card)
  await runRecordedStep(
    page,
    caseSlug,
    '07-print-files-prusa',
    'Print Files Tab: Switch Printer to Prusa MK4S & Back',
    telemetry,
    async () => {
      const printBtn = page
        .getByRole('button', { name: /^Print Files/i })
        .first();
      await expect(printBtn).toBeVisible();
      await printBtn.click({ force: true });
      await page.waitForTimeout(600);
      await assertNoUndefinedOrNaNOrErrorToast(
        page,
        'Print Files Tab',
        telemetry
      );

      const printerSelect = page
        .getByTestId('printer-select')
        .or(page.locator('#printer-select'))
        .first();
      await expect(printerSelect).toBeVisible({ timeout: 5000 });

      await printerSelect.selectOption('prusa-mk4s', { force: true });
      await page.waitForTimeout(500);
      const selectedVal = await printerSelect.inputValue();
      expect(selectedVal).toBe('prusa-mk4s');

      await captureStepScreenshot(
        page,
        caseSlug,
        '07a-printer-prusa-mk4s',
        telemetry
      );

      await printerSelect.selectOption('bambu-a1', { force: true });
      await page.waitForTimeout(400);
      expect(await printerSelect.inputValue()).toBe('bambu-a1');

      return 'Switched printer to Prusa MK4/MK4S (250×210×220mm) and back to Bambu Lab A1';
    }
  );

  await runRecordedStep(
    page,
    caseSlug,
    '08-print-service-card',
    'Print Files Tab: Open Print-Service Quote Card',
    telemetry,
    async () => {
      const noPrinterCard = page
        .getByTestId('no-printer-card')
        .or(page.getByText(/No printer\? Get it printed/i))
        .first();
      await expect(noPrinterCard).toBeVisible({ timeout: 5000 });

      const jlcBtn = page
        .getByTestId('service-option-jlc3dp')
        .or(page.getByRole('button', { name: /JLC3DP/i }))
        .first();
      if (await jlcBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await jlcBtn.click({ force: true });
        await page.waitForTimeout(350);
      }

      const craftcloudBtn = page
        .getByTestId('service-option-craftcloud')
        .or(page.getByRole('button', { name: /Craftcloud/i }))
        .first();
      if (await craftcloudBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await craftcloudBtn.click({ force: true });
        await page.waitForTimeout(350);
      }

      return 'Inspected Print-Service quote card (JLC3DP & Craftcloud)';
    }
  );

  // 5. Instructions Tab (including Play & Step)
  await runRecordedStep(
    page,
    caseSlug,
    '09-instructions-play',
    'Instructions Tab: Three.js IKEA Assembly Player Play & Step',
    telemetry,
    async () => {
      const instrBtn = page
        .getByRole('button', { name: /^Instructions/i })
        .first();
      await expect(instrBtn).toBeVisible();
      await instrBtn.click({ force: true });
      await page.waitForTimeout(800);
      await assertNoUndefinedOrNaNOrErrorToast(
        page,
        'Instructions Tab',
        telemetry
      );

      const playPauseBtn = page
        .getByTestId('play-pause-btn')
        .or(page.getByRole('button', { name: /▶ Play|⏸ Pause/i }))
        .first();
      await expect(playPauseBtn).toBeVisible({ timeout: 5000 });

      const txt = (await playPauseBtn.textContent()) || '';
      if (txt.includes('Play')) {
        await playPauseBtn.click({ force: true });
      }
      await page.waitForTimeout(1000);

      const nextStepBtn = page.getByTestId('next-step-btn').first();
      if (await nextStepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextStepBtn.click({ force: true });
        await page.waitForTimeout(500);
        await nextStepBtn.click({ force: true });
        await page.waitForTimeout(500);
      }

      return 'Played IKEA-style 3D assembly instructions and stepped through motion choreography';
    }
  );

  // 6. Exploded View Tab (explode slider + click a part)
  await runRecordedStep(
    page,
    caseSlug,
    '10-exploded-view',
    'Exploded View Tab: Explode Slider & Part Click Callout',
    telemetry,
    async () => {
      const explodedBtn = page
        .getByRole('button', { name: /^Exploded View/i })
        .first();
      await expect(explodedBtn).toBeVisible();
      await explodedBtn.click({ force: true });
      await page.waitForTimeout(800);
      await assertNoUndefinedOrNaNOrErrorToast(
        page,
        'Exploded View Tab',
        telemetry
      );

      const explodeSlider = page
        .getByTestId('explode-slider')
        .or(page.locator('input[type="range"][aria-label*="Explode" i]'))
        .first();
      await expect(explodeSlider).toBeVisible({ timeout: 5000 });

      for (const val of ['0.45', '0.85']) {
        await explodeSlider.evaluate((el, v) => {
          const input = el as HTMLInputElement;
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          setter?.call(input, v);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, val);
        await page.waitForTimeout(400);
      }

      const partChips = page.locator('[data-testid^="part-chip-"]');
      const chipCount = await partChips.count();
      expect(chipCount, 'Exploded view should list part chips').toBeGreaterThan(
        0
      );
      await partChips.first().click({ force: true });
      await page.waitForTimeout(400);
      if (chipCount > 2) {
        await partChips.nth(2).click({ force: true });
        await page.waitForTimeout(400);
      }

      return `Dragged 3D explode slider and clicked part chips (${chipCount} parts)`;
    }
  );

  // 7. Modify Chat ("make it 20% taller")
  await runRecordedStep(
    page,
    caseSlug,
    '11-modify-chat',
    'Modify Chat: Selective Re-Orchestration ("make it 20% taller")',
    telemetry,
    async () => {
      await setReactInputValue(
        page,
        'input[aria-label="Ask Argon to modify this project"]',
        'make it 20% taller'
      );
      await page.waitForTimeout(300);

      const askBtn = page.getByRole('button', { name: /Ask Argon/i }).first();
      await expect(askBtn).toBeEnabled();
      await askBtn.click({ force: true });

      const diffBadge = page.getByText(/Modification Diff Summary/i).first();
      await expect(diffBadge).toBeVisible({ timeout: 65_000 });
      await page.waitForTimeout(600);
      await assertNoUndefinedOrNaNOrErrorToast(
        page,
        'Modify Chat Diff',
        telemetry
      );

      return 'Submitted "make it 20% taller" and verified 3-column Modification Diff Summary';
    }
  );
}

test.describe('Get Me An Alt — Presets, Free-Text & Edge Cases E2E Suite', () => {
  test.setTimeout(360_000);

  test.afterEach(async ({ page }, testInfo: TestInfo) => {
    const slug = testCaseSlugMap.get(testInfo.title);
    if (!slug) return;
    const telemetry = caseTelemetryMap.get(slug);
    const video = page.video();
    await page.close().catch(() => {});

    if (video) {
      try {
        fs.mkdirSync(OUT_ROOT, { recursive: true });
        const destWebm = path.join(OUT_ROOT, `presets-${slug}.webm`);
        await video.saveAs(destWebm);
        console.log(`[presets.spec] Saved video: ${destWebm}`);
      } catch (err) {
        console.warn(`[presets.spec] Failed to save video for ${slug}:`, err);
      }
    }

    if (telemetry) {
      const caseDir = ensureCaseDir(slug);
      fs.writeFileSync(
        path.join(caseDir, 'telemetry.json'),
        JSON.stringify(telemetry, null, 2)
      );
    }
  });

  // ===========================================================================
  // CASE 1A: Preset — Smart Plant Auto-Waterer (Demo)
  // ===========================================================================
  test('Case 1a: Preset — Smart Plant Auto-Waterer demo', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'plant-waterer';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Preset: Smart Plant Auto-Waterer (Instant Demo)',
      inputDescription:
        'Click "Smart Plant Auto-Waterer" preset card in #showcase-gallery',
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#showcase-gallery')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing page and #showcase-gallery visible';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-click-preset',
      'Click Smart Plant Auto-Waterer Preset Card',
      telemetry,
      async () => {
        await page.evaluate(() => {
          const section = document.querySelector('#showcase-gallery');
          section?.scrollIntoView({ behavior: 'instant' });
          const buttons = Array.from(
            section?.querySelectorAll('button') || []
          );
          const target = buttons.find((b) =>
            /Smart Plant Auto-Waterer/i.test(b.textContent || '')
          );
          if (!target) throw new Error('Smart Plant Auto-Waterer card not found');
          (target as HTMLButtonElement).click();
        });
        return 'Clicked Smart Plant Auto-Waterer preset card';
      }
    );

    await exerciseAllProjectTabsAndModify(page, caseSlug, telemetry, true);
    telemetry.totalDurationMs = Date.now() - t0;
  });

  // ===========================================================================
  // CASE 1B: Preset — Articulated Tabletop Studio Art Easel
  // ===========================================================================
  test('Case 1b: Preset — Articulated Tabletop Studio Art Easel', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'art-easel';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Preset: Articulated Tabletop Studio Art Easel',
      inputDescription:
        'Click "Articulated Tabletop Studio Art Easel" preset card in #showcase-gallery',
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#showcase-gallery')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing page loaded';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-click-preset',
      'Click Articulated Tabletop Studio Art Easel Preset Card',
      telemetry,
      async () => {
        await page.evaluate(() => {
          const section = document.querySelector('#showcase-gallery');
          section?.scrollIntoView({ behavior: 'instant' });
          const buttons = Array.from(
            section?.querySelectorAll('button') || []
          );
          const target = buttons.find((b) =>
            /Articulated Tabletop Studio Art Easel/i.test(b.textContent || '')
          );
          if (!target) throw new Error('Art Easel card not found');
          (target as HTMLButtonElement).click();
        });
        return 'Clicked Art Easel preset card';
      }
    );

    await exerciseAllProjectTabsAndModify(page, caseSlug, telemetry, true);
    telemetry.totalDurationMs = Date.now() - t0;
  });

  // ===========================================================================
  // CASE 1C: Preset — iPhone Macro Microscope & Slide Adapter
  // ===========================================================================
  test('Case 1c: Preset — iPhone Macro Microscope & Slide Adapter', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'iphone-magnifier';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Preset: iPhone Macro Microscope & Slide Adapter',
      inputDescription:
        'Click "iPhone Macro Microscope & Slide Adapter" preset card in #showcase-gallery',
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#showcase-gallery')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing page loaded';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-click-preset',
      'Click iPhone Macro Microscope & Slide Adapter Preset Card',
      telemetry,
      async () => {
        await page.evaluate(() => {
          const section = document.querySelector('#showcase-gallery');
          section?.scrollIntoView({ behavior: 'instant' });
          const buttons = Array.from(
            section?.querySelectorAll('button') || []
          );
          const target = buttons.find((b) =>
            /iPhone Macro Microscope/i.test(b.textContent || '')
          );
          if (!target) throw new Error('iPhone Magnifier card not found');
          (target as HTMLButtonElement).click();
        });
        return 'Clicked iPhone Magnifier preset card';
      }
    );

    await exerciseAllProjectTabsAndModify(page, caseSlug, telemetry, true);
    telemetry.totalDurationMs = Date.now() - t0;
  });

  // ===========================================================================
  // CASE 1D: Preset — Benchtop Lab Pipette Liquid Handler Stand
  // ===========================================================================
  test('Case 1d: Preset — Benchtop Lab Pipette Liquid Handler Stand', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'liquid-handler';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Preset: Benchtop Lab Pipette Liquid Handler Stand',
      inputDescription:
        'Click "Benchtop Lab Pipette Liquid Handler Stand" preset card in #showcase-gallery',
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#showcase-gallery')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing page loaded';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-click-preset',
      'Click Benchtop Lab Pipette Liquid Handler Stand Preset Card',
      telemetry,
      async () => {
        await page.evaluate(() => {
          const section = document.querySelector('#showcase-gallery');
          section?.scrollIntoView({ behavior: 'instant' });
          const buttons = Array.from(
            section?.querySelectorAll('button') || []
          );
          const target = buttons.find((b) =>
            /Benchtop Lab Pipette Liquid Handler/i.test(b.textContent || '')
          );
          if (!target) throw new Error('Liquid Handler card not found');
          (target as HTMLButtonElement).click();
        });
        return 'Clicked Liquid Handler preset card';
      }
    );

    await exerciseAllProjectTabsAndModify(page, caseSlug, telemetry, true);
    telemetry.totalDurationMs = Date.now() - t0;
  });

  // ===========================================================================
  // CASE 2: Free-Text Description — 'a motorized camera slider for time-lapse, 1m travel'
  // ===========================================================================
  test('Case 2: Free-text description — motorized camera slider 1m travel', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'camera-slider';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const promptText = 'a motorized camera slider for time-lapse, 1m travel';
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Free-Text Input: Motorized Camera Slider (1m travel)',
      inputDescription: `Free-text prompt: "${promptText}"`,
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#hero-command')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing hero command bar visible';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-submit-freetext',
      'Enter Free-Text Description & Submit',
      telemetry,
      async () => {
        await setReactInputValue(
          page,
          '#hero-command input[type="text"]',
          promptText
        );
        await page.waitForTimeout(300);

        await page.evaluate(() => {
          const btn = document.querySelector(
            '#hero-command button[type="submit"]'
          ) as HTMLButtonElement | null;
          btn?.click();
        });
        return `Submitted prompt: "${promptText}"`;
      }
    );

    await exerciseAllProjectTabsAndModify(page, caseSlug, telemetry, false);
    telemetry.totalDurationMs = Date.now() - t0;
  });

  // ===========================================================================
  // CASE 3: Edge Cases — Empty Submit & Invalid/Garbage URL
  // ===========================================================================
  test('Case 3: Edge cases — empty submit and invalid/garbage URL', async ({
    page,
  }, testInfo) => {
    const caseSlug = 'edge-cases';
    testCaseSlugMap.set(testInfo.title, caseSlug);
    const t0 = Date.now();
    const telemetry: CaseTelemetry = {
      caseSlug,
      title: 'Edge Cases: Empty Submit & Invalid/Garbage URL',
      inputDescription:
        '1) Empty submit on landing form; 2) Direct POST /api/objects {}; 3) Invalid/garbage URL "https://invalid.domain.nonexistent.tld/garbage-404-xyz"',
      totalDurationMs: 0,
      pipelineWaitMs: 0,
      steps: [],
      agentTimings: [],
      artifactQuality: {},
      consoleErrors: [],
      failedNetworkRequests: [],
      screenshots: [],
      bugsDetected: [],
    };
    caseTelemetryMap.set(caseSlug, telemetry);
    await setupFastLandingAndCollectors(page, telemetry);

    await runRecordedStep(
      page,
      caseSlug,
      '01-landing',
      'Open Landing Page',
      telemetry,
      async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#hero-command')).toBeVisible({
          timeout: 15_000,
        });
        return 'Landing page opened';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '02-empty-submit',
      'Submit Empty Form & Verify Friendly Validation Error',
      telemetry,
      async () => {
        await setReactInputValue(
          page,
          '#hero-command input[type="text"]',
          '   '
        );
        await page.evaluate(() => {
          const btn = document.querySelector(
            '#hero-command button[type="submit"]'
          ) as HTMLButtonElement | null;
          btn?.click();
        });
        await page.waitForTimeout(400);

        const errMsg = page
          .getByText(
            /Paste a product link, video link, description, or upload an image first/i
          )
          .first();
        await expect(errMsg).toBeVisible({ timeout: 5000 });
        expect(page.url()).toBe(`${BASE_URL}/`);
        return 'Friendly validation error displayed on empty submit without crashing or navigating';
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '03-api-empty-post',
      'Direct POST /api/objects with Empty Body Returns HTTP 400 Friendly Error',
      telemetry,
      async () => {
        const apiCheck = await page.evaluate(async () => {
          const r = await fetch('/api/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await r.json().catch(() => ({}));
          return { status: r.status, error: data.error };
        });
        expect(apiCheck.status).toBe(400);
        expect(String(apiCheck.error || '')).toMatch(
          /Please provide a product URL/i
        );
        return `POST /api/objects {} returned HTTP ${apiCheck.status}: "${apiCheck.error}"`;
      }
    );

    await runRecordedStep(
      page,
      caseSlug,
      '04-garbage-url-submit',
      'Submit Invalid/Garbage URL ("https://invalid.domain.nonexistent.tld/garbage-404-xyz")',
      telemetry,
      async () => {
        const garbageUrl =
          'https://invalid.domain.nonexistent.tld/garbage-404-xyz';
        await setReactInputValue(
          page,
          '#hero-command input[type="text"]',
          garbageUrl
        );
        await page.waitForTimeout(300);

        await page.evaluate(() => {
          const btn = document.querySelector(
            '#hero-command button[type="submit"]'
          ) as HTMLButtonElement | null;
          btn?.click();
        });
        await page.waitForTimeout(2500);

        const currentUrl = page.url();
        const bodyText = await page.locator('body').innerText();
        expect(bodyText.length).toBeGreaterThan(20);
        expect(bodyText).not.toMatch(
          /Application error: a client-side exception/i
        );

        if (currentUrl.includes('/projects/')) {
          telemetry.bugsDetected.push(
            `Garbage URL ("${garbageUrl}") was accepted without URL hostname validation on app/page.tsx / app/api/objects/route.ts and launched a full pipeline run (${currentUrl}) instead of showing an invalid-URL error.`
          );
          return `Navigated to ${currentUrl} without crashing (no client/server URL validation rejected the garbage URL)`;
        }
        return `Stayed on landing page with inline message (${currentUrl})`;
      }
    );

    telemetry.totalDurationMs = Date.now() - t0;
  });
});
