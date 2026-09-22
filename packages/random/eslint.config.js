import { createLibraryConfig } from "@repo/eslint-config/library";

/** @type {import("eslint").Linter.Config[]} */
export default createLibraryConfig(import.meta.dirname);
