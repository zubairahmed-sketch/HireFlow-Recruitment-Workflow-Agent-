/**
 * Resume text extraction from PDF and DOCX files.
 * Uses pdfjs-dist for PDFs and mammoth for DOCX.
 * 
 * This module handles the raw file → plain text conversion.
 * The extracted text is stored in applications.resume_text for scoring.
 */

import mammoth from 'mammoth';

/**
 * Extract plain text from a resume file buffer.
 * Supports PDF (.pdf) and DOCX (.docx) formats.
 */
export async function extractResumeText(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  const extension = fileName.toLowerCase().split('.').pop();

  switch (extension) {
    case 'pdf':
      return extractFromPDF(fileBuffer);
    case 'docx':
      return extractFromDOCX(fileBuffer);
    default:
      throw new Error(
        `Unsupported file format: .${extension}. Only PDF and DOCX are supported.`
      );
  }
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 */
async function extractFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid issues with pdfjs-dist's worker in Node.js
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const textParts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => 'str' in item && typeof (item as Record<string, unknown>).str === 'string')
      .map((item) => (item as { str: string }).str)
      .join(' ');
    textParts.push(pageText);
  }

  const fullText = textParts.join('\n\n');

  if (fullText.trim().length === 0) {
    throw new Error(
      'PDF text extraction returned empty content. The PDF may be image-based or corrupted.'
    );
  }

  return fullText.trim();
}

/**
 * Extract text from a DOCX file using mammoth.
 */
async function extractFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });

  if (result.value.trim().length === 0) {
    throw new Error(
      'DOCX text extraction returned empty content. The file may be empty or corrupted.'
    );
  }

  // Log any conversion warnings (e.g., unsupported elements)
  if (result.messages.length > 0) {
    console.warn(
      '[extractText] DOCX conversion warnings:',
      result.messages.map((m) => m.message)
    );
  }

  return result.value.trim();
}
