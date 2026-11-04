/**
 * Version of the bundled llama.rn inference backend (modules/llama.rn).
 *
 * Keep this in sync with modules/llama.rn/package.json whenever the vendored
 * backend is upgraded — the Settings screen reads it, and the build number is
 * taken from llama.rn's own BuildInfo.
 */
export const LLAMA_RN_VERSION = '0.13.0-rc.9'
