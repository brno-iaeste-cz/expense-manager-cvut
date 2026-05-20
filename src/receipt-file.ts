const PDF_MIME_TYPE = 'application/pdf';
const JPEG_MIME_TYPE = 'image/jpeg';
const PDF_EXTENSION = '.pdf';
const PX_TO_PT = 72 / 96;

export function isPdfFile(file: File) {
  return getNormalizedMimeType(file) === PDF_MIME_TYPE || hasExtension(file.name, PDF_EXTENSION);
}

export function isSupportedReceiptFile(file: File) {
  const mimeType = getNormalizedMimeType(file);
  return isPdfFile(file) || mimeType.startsWith('image/');
}

export async function prepareReceiptFile(file: File) {
  if (isPdfFile(file)) {
    return file;
  }

  return convertImageFileToPdf(file);
}

export function getReceiptAcceptAttribute() {
  return 'image/*,application/pdf,.pdf';
}

export function getReceiptPreviewType(file: File | null) {
  if (!file) return 'empty';
  return isPdfFile(file) ? 'pdf' : 'image';
}

async function convertImageFileToPdf(file: File) {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Pro převod obrázku do PDF se nepodařilo připravit canvas.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.element, 0, 0, image.width, image.height);

  const jpegBlob = await canvasToBlob(canvas, JPEG_MIME_TYPE, 0.92);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = buildSingleImagePdf(jpegBytes, image.width, image.height);
  const pdfName = replaceExtension(file.name, PDF_EXTENSION);

  return new File([pdfBytes], pdfName, {
    type: PDF_MIME_TYPE,
    lastModified: Date.now(),
  });
}

function loadImage(file: File) {
  return new Promise<{ element: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      URL.revokeObjectURL(url);
      resolve({ element: image, width, height });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Vybraný obrázek se nepodařilo načíst. Zkuste JPG, PNG nebo PDF.'));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Obrázek se nepodařilo převést do PDF.'));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function buildSingleImagePdf(jpegBytes: Uint8Array, imageWidthPx: number, imageHeightPx: number) {
  const encoder = new TextEncoder();
  const imageWidthPt = roundPdfNumber(imageWidthPx * PX_TO_PT);
  const imageHeightPt = roundPdfNumber(imageHeightPx * PX_TO_PT);
  const imageStream = `4 0 obj
<< /Type /XObject /Subtype /Image /Width ${imageWidthPx} /Height ${imageHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>
stream
`;
  const imageStreamSuffix = `
endstream
endobj
`;
  const pageContent = `q
${imageWidthPt} 0 0 ${imageHeightPt} 0 0 cm
/Im0 Do
Q
`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imageWidthPt} ${imageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>
endobj
`,
    null,
    `5 0 obj
<< /Length ${encoder.encode(pageContent).length} >>
stream
${pageContent}endstream
endobj
`,
  ] as const;

  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let byteLength = parts[0].length;

  for (const object of objects) {
    offsets.push(byteLength);

    if (object === null) {
      const prefix = encoder.encode(imageStream);
      const suffix = encoder.encode(imageStreamSuffix);
      parts.push(prefix, jpegBytes, suffix);
      byteLength += prefix.length + jpegBytes.length + suffix.length;
      continue;
    }

    const encoded = encoder.encode(object);
    parts.push(encoded);
    byteLength += encoded.length;
  }

  const xrefOffset = byteLength;
  const xrefLines = ['xref', `0 ${offsets.length}`, '0000000000 65535 f '];
  for (let index = 1; index < offsets.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }

  const trailer = `trailer
<< /Size ${offsets.length} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  parts.push(encoder.encode(`${xrefLines.join('\n')}\n${trailer}`));
  return joinUint8Arrays(parts);
}

function joinUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }

  return joined;
}

function replaceExtension(filename: string, extension: string) {
  const baseName = String(filename || 'receipt').replace(/\.[^.]+$/, '');
  return `${baseName}${extension}`;
}

function hasExtension(filename: string, extension: string) {
  return String(filename || '').toLowerCase().endsWith(extension);
}

function getNormalizedMimeType(file: File) {
  return String(file.type || '').toLowerCase();
}

function roundPdfNumber(value: number) {
  return Number(value.toFixed(2));
}
