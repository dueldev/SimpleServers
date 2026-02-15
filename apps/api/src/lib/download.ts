import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { request } from "undici";

const USER_AGENT = "SimpleServers/0.1 (+https://github.com)";

type RetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
};

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(options: RetryOptions, run: () => Promise<T>): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const initialDelayMs = Math.max(100, options.initialDelayMs ?? 400);
  let attempt = 0;
  let nextDelay = initialDelayMs;
  let lastError: unknown;

  while (attempt < attempts) {
    try {
      return await run();
    } catch (error) {
      const retryable = !(
        typeof error === "object" &&
        error !== null &&
        "retryable" in error &&
        (error as { retryable?: boolean }).retryable === false
      );
      lastError = error;
      attempt += 1;
      if (!retryable || attempt >= attempts) {
        break;
      }
      await delay(nextDelay);
      nextDelay *= 2;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJsonWithRetry<T>(url: string, retryOptions: RetryOptions = {}): Promise<T> {
  return withRetries(retryOptions, async () => {
    let currentUrl = url;
    let redirects = 0;
    while (redirects < 6) {
      const response = await request(currentUrl, {
        headers: {
          "user-agent": USER_AGENT
        }
      });

      if (response.statusCode >= 300 && response.statusCode < 400) {
        const header = response.headers.location;
        const location = Array.isArray(header) ? header[0] : header;
        if (!location) {
          throw new Error(`Redirect response missing location for ${currentUrl}`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      if (response.statusCode >= 400) {
        const message = await response.body.text();
        const error = new Error(`Failed to fetch ${currentUrl}, status=${response.statusCode}: ${message.slice(0, 300)}`);
        if (isRetryableStatus(response.statusCode)) {
          throw error;
        }
        throw Object.assign(error, { retryable: false });
      }

      return (await response.body.json()) as T;
    }

    throw new Error(`Too many redirects while downloading ${url}`);
  });
}

export async function downloadToFile(url: string, destinationFile: string, retryOptions: RetryOptions = {}): Promise<void> {
  const destinationDir = path.dirname(destinationFile);
  fs.mkdirSync(destinationDir, { recursive: true });

  const tempFile = `${destinationFile}.tmp`;
  fs.rmSync(tempFile, { force: true });
  let success = false;

  try {
    await withRetries(retryOptions, async () => {
      let currentUrl = url;
      let redirects = 0;
      while (redirects < 6) {
        const response = await request(currentUrl, {
          headers: {
            "user-agent": USER_AGENT
          }
        });

        if (response.statusCode >= 300 && response.statusCode < 400) {
          const header = response.headers.location;
          const location = Array.isArray(header) ? header[0] : header;
          if (!location) {
            throw new Error(`Redirect response missing location for ${currentUrl}`);
          }

          currentUrl = new URL(location, currentUrl).toString();
          redirects += 1;
          continue;
        }

        if (response.statusCode >= 400) {
          const message = await response.body.text();
          const error = new Error(`Failed to download ${currentUrl}, status=${response.statusCode}: ${message.slice(0, 300)}`);
          if (isRetryableStatus(response.statusCode)) {
            throw error;
          }
          throw Object.assign(error, { retryable: false });
        }

        const writer = fs.createWriteStream(tempFile);
        await pipeline(response.body, writer);
        success = true;
        return;
      }

      throw new Error(`Too many redirects while downloading ${url}`);
    });
  } finally {
    if (!success) {
      fs.rmSync(tempFile, { force: true });
    }
  }

  fs.rmSync(destinationFile, { force: true });
  fs.renameSync(tempFile, destinationFile);
}
