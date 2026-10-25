import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentLogEntry, RunnerMode } from '../types';

export interface RunAgentOptions<T> {
  stageName: string;
  prompt: string;
  cwd: string;
  artifactFilename?: string;
  inlineImage?: {
    mimeType: string;
    base64Data: string;
  };
  useGoogleSearchGrounding?: boolean;
  preferRestForSpeed?: boolean;
  timeoutMs?: number;
  onLog?: (entry: AgentLogEntry) => void;
  fallbackGenerator: () => T;
}

export interface RunAgentResult<T> {
  data: T;
  runner: RunnerMode;
  command?: string;
  conversationId?: string;
  model: string;
  durationMs: number;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  groundingUrls?: { title: string; url: string }[];
}

/**
 * Resolves writable data directory. On Vercel, uses `/tmp/data`; locally uses `<repo>/data`.
 */
export function getDataRootDir(): string {
  if (process.env.VERCEL) {
    return '/tmp/data';
  }
  return path.join(process.cwd(), 'data');
}

export function getObjectsDir(): string {
  const dir = path.join(getDataRootDir(), 'objects');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadEnvLocalKey(): string {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GEMINI_API_KEY=')) {
          const val = trimmed
            .slice('GEMINI_API_KEY='.length)
            .trim()
            .replace(/^["']|["']$/g, '');
          if (val) {
            process.env.GEMINI_API_KEY = val;
            return val;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export function extractJsonFromText<T>(rawText: string): T | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Detects whether `agy` is available on PATH or ~/.local/bin/agy.
 * Returns null immediately when running on Vercel (`process.env.VERCEL`).
 */
export function resolveAgyBinary(): string | null {
  if (process.env.VERCEL || process.env.USE_AGY === '0') {
    return null;
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...pathDirs.map((d) => path.join(d, 'agy')),
    path.join(os.homedir(), '.local', 'bin', 'agy'),
    '/home/box/.local/bin/agy',
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function runWithAgyCli<T>(
  options: RunAgentOptions<T>,
  agyBin: string,
  apiKey: string,
  model: string,
  emitLog: (level: AgentLogEntry['level'], message: string) => void
): Promise<RunAgentResult<T> | null> {
  const startTime = Date.now();
  const timeoutSec = Math.max(15, Math.round((options.timeoutMs || 25000) / 1000));
  const fullPrompt = `${options.prompt}\n\nIMPORTANT: Do NOT invoke any tools, shell commands, or file reads. Respond immediately with ONLY raw valid JSON matching the requested schema (no markdown fences).`;

  const displayCmd = `agy -p "<${options.stageName.toLowerCase()}-prompt>" --model ${model} --output-format json --dangerously-skip-permissions`;
  emitLog(
    'cmd',
    `$ ${displayCmd} (cwd: ${path.relative(process.cwd(), options.cwd) || options.cwd})`
  );

  return new Promise((resolve) => {
    const args = [
      '-p',
      fullPrompt,
      '--model',
      model,
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
      '--disable-slash-commands',
      '--effort',
      'low',
      '--print-timeout',
      `${timeoutSec}s`,
    ];

    const child = spawn(agyBin, args, {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        GEMINI_API_KEY: apiKey,
        PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const killTimer = setTimeout(() => {
      emitLog(
        'warn',
        `agy CLI exceeded ${timeoutSec}s timeout; switching to Gemini REST API.`
      );
      child.kill('SIGTERM');
    }, (timeoutSec + 3) * 1000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      emitLog(
        'warn',
        `agy spawn error (${err.message}); falling back to Gemini REST API.`
      );
      resolve(null);
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      const durationMs = Date.now() - startTime;

      const lines = stdout
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1] || stdout;

      try {
        const envelope = JSON.parse(lastLine);
        const convId: string | undefined = envelope.conversation_id;
        const usage = envelope.usage
          ? {
              input: Number(envelope.usage.input_tokens || 0),
              output: Number(envelope.usage.output_tokens || 0),
              total: Number(envelope.usage.total_tokens || 0),
            }
          : undefined;

        const responseText: string =
          typeof envelope.response === 'string' ? envelope.response : '';
        let parsed = extractJsonFromText<T>(responseText);

        if (!parsed && options.artifactFilename) {
          const candidateFile = path.join(options.cwd, options.artifactFilename);
          if (fs.existsSync(candidateFile)) {
            parsed = extractJsonFromText<T>(
              fs.readFileSync(candidateFile, 'utf-8')
            );
          }
        }

        if (parsed) {
          emitLog(
            'success',
            `agy (${model}) completed in ${(durationMs / 1000).toFixed(1)}s [conv: ${convId?.slice(0, 8) || 'local'}, tokens: ${usage?.total || 'N/A'}]`
          );
          resolve({
            data: parsed,
            runner: 'agy-cli',
            command: displayCmd,
            conversationId: convId,
            model,
            durationMs,
            tokensUsed: usage,
          });
          return;
        }
      } catch {
        const directParsed = extractJsonFromText<T>(stdout);
        if (directParsed) {
          emitLog(
            'success',
            `agy (${model}) completed in ${(durationMs / 1000).toFixed(1)}s`
          );
          resolve({
            data: directParsed,
            runner: 'agy-cli',
            command: displayCmd,
            model,
            durationMs,
          });
          return;
        }
      }

      emitLog(
        'warn',
        `agy exited (code ${code}) without structured JSON${stderr ? `: ${stderr.slice(0, 120)}` : ''}; falling back to Gemini REST API.`
      );
      resolve(null);
    });
  });
}

async function runWithGeminiRest<T>(
  options: RunAgentOptions<T>,
  apiKey: string,
  model: string,
  emitLog: (level: AgentLogEntry['level'], message: string) => void
): Promise<RunAgentResult<T> | null> {
  const startTime = Date.now();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  emitLog(
    'cmd',
    `POST ${endpoint} ${options.useGoogleSearchGrounding ? '[tools: google_search]' : '[responseMimeType: application/json]'}${options.inlineImage ? ' [+inlineData image]' : ''}`
  );

  const parts: Array<Record<string, unknown>> = [];
  if (options.inlineImage) {
    parts.push({
      inlineData: {
        mimeType: options.inlineImage.mimeType,
        data: options.inlineImage.base64Data,
      },
    });
  }
  parts.push({
    text: `${options.prompt}\n\nRespond with ONLY valid JSON matching the schema.`,
  });

  const useSearchTool = Boolean(
    options.useGoogleSearchGrounding && !process.env.VERCEL
  );
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.25,
      thinkingConfig: { thinkingLevel: 'LOW' },
      ...(useSearchTool ? {} : { responseMimeType: 'application/json' }),
    },
  };

  if (useSearchTool) {
    body.tools = [{ google_search: {} }];
  }

  try {
    const controller = new AbortController();
    const effectiveTimeoutMs = process.env.VERCEL
      ? Math.min(options.timeoutMs || 6500, 6500)
      : options.timeoutMs || 45000;
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text();
      emitLog(
        'warn',
        `Gemini REST HTTP ${res.status}: ${errText.slice(0, 160)}`
      );
      return null;
    }

    const json = await res.json();
    const durationMs = Date.now() - startTime;
    const candidate = json?.candidates?.[0];
    const contentParts: Array<{ text?: string; thought?: boolean }> =
      candidate?.content?.parts || [];

    const textParts = contentParts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text!)
      .join('\n');

    const fallbackText =
      contentParts
        .map((p) => p.text || '')
        .filter(Boolean)
        .pop() || '';

    const parsed =
      extractJsonFromText<T>(textParts) ||
      extractJsonFromText<T>(fallbackText);

    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks || [];
    const groundingUrls: { title: string; url: string }[] = [];
    for (const chunk of groundingChunks) {
      if (chunk?.web?.uri) {
        groundingUrls.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri,
        });
      }
    }

    const usageMeta = json?.usageMetadata;
    const tokensUsed = usageMeta
      ? {
          input: Number(usageMeta.promptTokenCount || 0),
          output: Number(usageMeta.candidatesTokenCount || 0),
          total: Number(usageMeta.totalTokenCount || 0),
        }
      : undefined;

    if (parsed) {
      emitLog(
        'success',
        `Gemini 4 Argon REST completed in ${(durationMs / 1000).toFixed(1)}s [tokens: ${tokensUsed?.total || 'N/A'}${groundingUrls.length ? `, grounded urls: ${groundingUrls.length}` : ''}]`
      );
      return {
        data: parsed,
        runner: 'gemini-rest',
        command: `POST ${endpoint}`,
        model,
        durationMs,
        tokensUsed,
        groundingUrls,
      };
    }

    emitLog(
      'warn',
      'Gemini REST response did not contain valid JSON; using synthesized fallback.'
    );
    return null;
  } catch (err) {
    emitLog(
      'warn',
      `Gemini REST error (${err instanceof Error ? err.message : String(err)})`
    );
    return null;
  }
}

export async function runGeminiAgent<T>(
  options: RunAgentOptions<T>
): Promise<RunAgentResult<T>> {
  const apiKey = loadEnvLocalKey();
  const model = process.env.GEMINI_MODEL || 'gemini-4-argon';
  const agyBin = resolveAgyBinary();

  const emitLog = (level: AgentLogEntry['level'], message: string) => {
    options.onLog?.({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
  };

  fs.mkdirSync(options.cwd, { recursive: true });

  if (apiKey) {
    if (
      agyBin &&
      !options.inlineImage &&
      !options.useGoogleSearchGrounding &&
      !options.preferRestForSpeed
    ) {
      const agyResult = await runWithAgyCli(
        options,
        agyBin,
        apiKey,
        model,
        emitLog
      );
      if (agyResult) {
        if (options.artifactFilename) {
          fs.writeFileSync(
            path.join(options.cwd, options.artifactFilename),
            JSON.stringify(agyResult.data, null, 2)
          );
        }
        return agyResult;
      }
    }

    const restResult = await runWithGeminiRest(
      options,
      apiKey,
      model,
      emitLog
    );
    if (restResult) {
      if (options.artifactFilename) {
        fs.writeFileSync(
          path.join(options.cwd, options.artifactFilename),
          JSON.stringify(restResult.data, null, 2)
        );
      }
      return restResult;
    }
  } else {
    emitLog(
      'warn',
      'No GEMINI_API_KEY found in environment; using deterministic agent synthesis.'
    );
  }

  const startTime = Date.now();
  const fallbackData = options.fallbackGenerator();
  if (options.artifactFilename) {
    fs.writeFileSync(
      path.join(options.cwd, options.artifactFilename),
      JSON.stringify(fallbackData, null, 2)
    );
  }
  emitLog(
    'info',
    `Completed ${options.stageName} via deterministic fallback synthesis.`
  );
  return {
    data: fallbackData,
    runner: 'deterministic',
    model,
    durationMs: Date.now() - startTime + 150,
  };
}
