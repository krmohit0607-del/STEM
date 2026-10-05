import { api } from '../api/client';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Worker } from 'tesseract.js';

export type InvoiceDocumentKind = 'PDA' | 'FDA' | 'Agent' | 'Service' | 'Freight' | 'Demurrage';
export interface InvoiceDocumentFields {
  port?: string;
  agent?: string;
  vendor?: string;
  category?: string;
  due?: string;
  currency?: string;
  estimated?: number;
  advance?: number;
  fdaFinal?: number;
  invoiceNo?: string;
  amount?: number;
  service?: string;
  invoice?: string;
  cost?: number;
  tax?: number;
  reason?: string;
  invoiceTo?: string;
  invoiceDate?: string;
  dueDate?: string;
  blQtyOverride?: string;
  freightRateOverride?: string;
  adcomOverride?: string;
  pctFreightDue?: string;
}

export async function readInvoiceDocument(file: File, progress: (message: string) => void): Promise<string> {
  if (file.size > 15 * 1024 * 1024) throw new Error('File exceeds the 15 MB extraction limit.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  let worker: Worker | undefined;
  const ocr = async (image: File | HTMLCanvasElement) => {
    if (!worker) {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, { logger: (entry) => progress(`${entry.status} ${Math.round((entry.progress ?? 0) * 100)}%`) });
    }
    const result = await worker.recognize(image);
    return result.data.text;
  };
  try {
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension ?? '')) return await ocr(file);
    if (extension === 'pdf' || file.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const document = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
      try {
        if (document.numPages > 20) throw new Error('Extract invoices with up to 20 pages.');
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
          progress(`Reading page ${pageNumber} of ${document.numPages}`);
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const items = content.items.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item);
          const rows: { y: number; items: typeof items }[] = [];
          for (const item of items) {
            const row = rows.find((entry) => Math.abs(entry.y - item.transform[5]) < 3);
            if (row) row.items.push(item);
            else rows.push({ y: item.transform[5], items: [item] });
          }
          let text = rows.sort((first, second) => second.y - first.y).map((row) => row.items.sort((first, second) => first.transform[4] - second.transform[4]).map((item, index, sorted) => {
            const previous = sorted[index - 1];
            const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
            return `${index ? (gap > 24 ? '\t' : ' ') : ''}${item.str}`;
          }).join('')).join('\n');
          if (text.replace(/\s/g, '').length < 30) {
            const viewport = page.getViewport({ scale: 1.5 });
            if (viewport.width * viewport.height > 16_000_000) throw new Error('Scanned page is too large for OCR.');
            const canvas = documentCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Cannot render scanned PDF.');
            await page.render({ canvasContext: context, viewport }).promise;
            text = await ocr(canvas);
            canvas.width = canvas.height = 0;
          }
          pages.push(text);
          page.cleanup();
        }
        return pages.join('\n');
      } finally { await document.destroy(); }
    }
    if (extension === 'docx') {
      const mammoth = await import('mammoth/mammoth.browser');
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    }
    if (['xlsx', 'xls', 'csv'].includes(extension ?? '')) {
      const xlsx = await import('xlsx');
      const book = xlsx.read(await file.arrayBuffer(), { type: 'array' });
      return book.SheetNames.map((name) => xlsx.utils.sheet_to_csv(book.Sheets[name], { FS: '\t' })).join('\n');
    }
    if (['txt', 'text'].includes(extension ?? '') || file.type.startsWith('text/')) return await file.text();
    throw new Error('Extraction supports PDF, images, DOCX, Excel, CSV and text files.');
  } finally { if (worker) await worker.terminate(); }
}

function documentCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

export async function extractInvoiceDocument(file: File, kind: InvoiceDocumentKind, progress: (message: string) => void): Promise<InvoiceDocumentFields> {
  const text = await readInvoiceDocument(file, progress);
  if (!text.trim()) throw new Error('No readable text found in this document.');
  if (text.length > 100_000) throw new Error('Document text is too long to extract.');
  progress('Matching invoice fields');
  return api.post<InvoiceDocumentFields>('/api/invoice-documents/extract', { kind, text });
}