import { spawn } from 'child_process';

async function commandAvailable(command: string, args: string[] = ['-version']) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0 || code === 1));
  });
}

function dynamicImport(specifier: string): Promise<any> {
  return (new Function('specifier', 'return import(specifier)'))(specifier);
}

export async function checkDependencies() {
  let sharp = false;
  let tesseract = false;
  let ffmpeg = false;
  let poppler = false;

  try {
    await dynamicImport('sharp');
    sharp = true;
  } catch {
    sharp = false;
  }

  ffmpeg = await commandAvailable('ffmpeg');
  tesseract = await commandAvailable('tesseract', ['--version']);
  poppler = await commandAvailable('pdftotext', ['-v']);

  return {
    sharp,
    ffmpeg,
    tesseract,
    poppler,
    imageThumbnails: sharp,
    videoThumbnails: ffmpeg,
    ocrImages: tesseract,
    pdfTextExtraction: poppler,
  };
}
