const PDF_MIME_TYPE = 'application/pdf';
const JPEG_MIME_TYPE = 'image/jpeg';
const PDF_EXTENSION = '.pdf';
const PX_TO_PT = 72 / 96;

type LoadedImage = {
  element: HTMLImageElement;
  width: number;
  height: number;
  jpegBytes: Uint8Array;
};

export function isPdfFile(file: File) {
  return getNormalizedMimeType(file) === PDF_MIME_TYPE || hasExtension(file.name, PDF_EXTENSION);
}

export function isSupportedReceiptFile(file: File) {
  const mimeType = getNormalizedMimeType(file);
  return isPdfFile(file) || mimeType.startsWith('image/');
}

export async function prepareReceiptFiles(files: File[]) {
  if (files.length === 0) {
    return null;
  }

  if (files.length === 1 && isPdfFile(files[0])) {
    return files[0];
  }

  if (files.some(isPdfFile)) {
    throw new Error('Pri nahrani vice souboru pouzijte pouze obrazky. PDF lze nahrat jen samostatne.');
  }

  const images = await Promise.all(files.map(loadImage));
  const pdfBytes = buildImagesPdf(images);
  const pdfName = buildReceiptPdfName(files);

  return new File([pdfBytes], pdfName, {
    type: PDF_MIME_TYPE,
    lastModified: Date.now(),
  });
}

export function getReceiptAcceptAttribute() {
  return 'image/*,application/pdf,.pdf';
}

export function getReceiptPreviewType(file: File | null) {
  if (!file) return 'empty';
  return isPdfFile(file) ? 'pdf' : 'image';
}

async function loadImage(file: File): Promise<LoadedImage> {
  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Pro prevod obrazku do PDF se nepodarilo pripravit canvas.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.element, 0, 0, image.width, image.height);

  const jpegBlob = await canvasToBlob(canvas, JPEG_MIME_TYPE, 0.92);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

  return {
    ...image,
    jpegBytes,
  };
}

function loadImageElement(file: File) {
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
      reject(new Error('Vybrany obrazek se nepodarilo nacist. Zkuste JPG, PNG nebo PDF.'));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Obrazek se nepodarilo prevest do PDF.'));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function buildImagesPdf(images: LoadedImage[]) {
  const encoder = new TextEncoder();
  const objectCount = 2 + images.length * 3;
  const objects: Uint8Array[] = [];
  const pageObjectIds: number[] = [];
  const imageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  let nextObjectId = 3;
  for (let index = 0; index < images.length; index += 1) {
    pageObjectIds.push(nextObjectId);
    imageObjectIds.push(nextObjectId + 1);
    contentObjectIds.push(nextObjectId + 2);
    nextObjectId += 3;
  }

  objects.push(encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  objects.push(
    encoder.encode(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>\nendobj\n`),
  );

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const pageObjectId = pageObjectIds[index];
    const imageObjectId = imageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const imageWidthPt = roundPdfNumber(image.width * PX_TO_PT);
    const imageHeightPt = roundPdfNumber(image.height * PX_TO_PT);
    const pageContent = `q\n${imageWidthPt} 0 0 ${imageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;

    objects.push(
      encoder.encode(
        `${pageObjectId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imageWidthPt} ${imageHeightPt}] /Resources << /XObject << /Im0 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>\nendobj\n`,
      ),
    );

    const imagePrefix = encoder.encode(
      `${imageObjectId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpegBytes.length} >>\nstream\n`,
    );
    const imageSuffix = encoder.encode('\nendstream\nendobj\n');
    objects.push(joinUint8Arrays([imagePrefix, image.jpegBytes, imageSuffix]));

    const contentBytes = encoder.encode(pageContent);
    objects.push(
      encoder.encode(
        `${contentObjectId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${pageContent}endstream\nendobj\n`,
      ),
    );
  }

  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let byteLength = parts[0].length;

  for (const object of objects) {
    offsets.push(byteLength);
    parts.push(object);
    byteLength += object.length;
  }

  const xrefOffset = byteLength;
  const xrefLines = ['xref', `0 ${objectCount + 1}`, '0000000000 65535 f '];

  for (let index = 1; index <= objectCount; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }

  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
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

function buildReceiptPdfName(files: File[]) {
  const firstFile = files[0];
  const baseName = String(firstFile?.name || 'receipt').replace(/\.[^.]+$/, '');
  return files.length === 1 ? `${baseName}${PDF_EXTENSION}` : `${baseName}-multi-page${PDF_EXTENSION}`;
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
