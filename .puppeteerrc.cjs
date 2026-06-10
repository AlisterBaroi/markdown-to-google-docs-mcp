/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Don't download Puppeteer's bundled Chromium. We use the system Chromium installed in the
// Docker image (PUPPETEER_EXECUTABLE_PATH); locally, server-side mermaid rendering is skipped.
module.exports = {
  skipDownload: true,
};
