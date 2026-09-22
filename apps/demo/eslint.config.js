import { createBrowserConfig } from "@repo/eslint-config/browser";

/** @type {import("eslint").Linter.Config[]} */
export default createBrowserConfig(import.meta.dirname);
