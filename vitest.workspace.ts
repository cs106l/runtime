/// <reference types="@vitest/browser/providers/playwright" />

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      include: ["**/*browser.{test,spec}.ts"],
      name: "browser",
      browser: {
        provider: "playwright",
        enabled: true,
        headless: true,
        screenshotFailures: false,
        instances: [
          {
            browser: "chromium",
            launch: {
              args: ["--enable-features=SharedArrayBuffer"],
            },
          },
        ],
      },
    },
  },
  {
    test: {
      include: ["**/*.{test,spec}.ts", "!**/*browser.{test,spec}.ts"],
      name: "unit",
      environment: "node",
    },
  },
]);
