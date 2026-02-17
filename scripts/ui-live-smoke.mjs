import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const API_URL = "http://127.0.0.1:4010/health";
const WEB_URL = "http://127.0.0.1:4173";
const BIN_SUFFIX = process.platform === "win32" ? ".cmd" : "";
const TSX_BIN = path.join(process.cwd(), "node_modules", ".bin", `tsx${BIN_SUFFIX}`);
const VITE_BIN = path.join(process.cwd(), "node_modules", ".bin", `vite${BIN_SUFFIX}`);
const children = [];

function startProcess(name, command, args, cwd, envOverrides = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...envOverrides
    }
  });
  children.push(child);

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0 && code !== 143 && signal !== "SIGTERM") {
      process.stderr.write(`[${name}] exited unexpectedly (${code ?? signal})\n`);
    }
  });

  return child;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      if (response.status >= 200 || response.status === 401 || response.status === 403 || response.status === 404) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
}

async function runDesktopSmoke(browser) {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByText("CONNECTED").first().waitFor({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Setup$/ }).click();
  await page.getByRole("heading", { name: "Guided Server Setup" }).waitFor({ timeout: 15_000 });

  await page.getByRole("button", { name: /^Manage$/ }).click();
  await page.getByRole("heading", { name: /^Crash Doctor$/ }).waitFor({ timeout: 15_000 });

  await page.getByRole("button", { name: /^Content$/ }).click();
  await page.getByRole("heading", { name: "Content Manager" }).waitFor({ timeout: 15_000 });
  await page.close();
}

async function runMobileSmoke(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByText("CONNECTED").first().waitFor({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Setup$/ }).click();
  await page.getByRole("heading", { name: "Guided Server Setup" }).waitFor({ timeout: 15_000 });

  await page.getByRole("button", { name: /^Overview$/ }).click();
  await page.getByRole("heading", { name: "Command Center" }).waitFor({ timeout: 15_000 });
  await page.close();
}

async function shutdownChildren() {
  await Promise.all(
    children.map(async (child) => {
      if (child.killed || child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(5000)]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    })
  );
}

async function main() {
  startProcess("api", TSX_BIN, ["watch", "src/main.ts"], path.join(process.cwd(), "apps", "api"), { LOG_LEVEL: "error" });
  startProcess("web", VITE_BIN, ["--host", "127.0.0.1", "--port", "4173"], path.join(process.cwd(), "apps", "web"));

  await waitForHttp(API_URL, 60_000);
  await waitForHttp(WEB_URL, 60_000);

  const browser = await chromium.launch({ headless: true });
  try {
    await runDesktopSmoke(browser);
    await runMobileSmoke(browser);
  } finally {
    await browser.close();
  }

  console.log("Live UI smoke test passed (desktop + mobile).");
}

let shuttingDown = false;
async function shutdownAndExit(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await shutdownChildren();
  process.exit(code);
}

process.on("SIGINT", () => {
  void shutdownAndExit(130);
});
process.on("SIGTERM", () => {
  void shutdownAndExit(143);
});

main()
  .then(() => shutdownAndExit(0))
  .catch(async (error) => {
    console.error(error);
    await shutdownAndExit(1);
  });
