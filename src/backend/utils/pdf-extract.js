const pdfParse = require('pdf-parse');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_PAGES = 500;
const PARSE_TIMEOUT_MS = 60000; // 60s

/**
 * Extract text from a PDF buffer.
 * @param {Buffer} buffer - PDF file buffer
 * @returns {{ text: string, pageCount: number, info: object }}
 */
async function extractTextFromPdf(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty PDF buffer');
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`PDF exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const data = await Promise.race([
    pdfParse(buffer, { max: MAX_PAGES }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF parsing timed out')), PARSE_TIMEOUT_MS)
    ),
  ]);

  if (!data.text || data.text.trim().length < 50) {
    throw new Error(
      'Could not extract meaningful text from this PDF. ' +
      'It may be an image-based (scanned) PDF. Please paste the text manually instead.'
    );
  }

  if (data.numpages > MAX_PAGES) {
    throw new Error(`PDF has ${data.numpages} pages, maximum is ${MAX_PAGES}`);
  }

  return {
    text: data.text.trim(),
    pageCount: data.numpages,
    info: {
      title: data.info?.Title || null,
      author: data.info?.Author || null,
    },
  };
}

module.exports = { extractTextFromPdf };
