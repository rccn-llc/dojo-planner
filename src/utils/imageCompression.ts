import imageCompression from 'browser-image-compression';

type ImageCompressionResult = {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
};

/**
 * Compress an image file for database storage
 * Reduces file size to ~50-200KB for efficient base64 storage
 */
export async function compressImageForStorage(
  file: File,
): Promise<ImageCompressionResult> {
  const originalSize = file.size;

  // Compression options optimized for avatar/profile pictures.
  // Target: 400x400px max, 80% JPEG quality = ~50-150KB.
  // maxSizeMB is kept well under the server-side photo cap: base64 encoding
  // inflates the byte size by ~33%, so a 200KB file → ~267KB data URL, which
  // stays under the 400KB validation limit (previously 500KB → ~666KB base64
  // exceeded the old 300KB cap and the upload was rejected — #208/#209/#212).
  const options = {
    maxSizeMB: 0.2, // 200KB max
    maxWidthOrHeight: 400, // Resize to max 400px
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    const compressedSize = compressedFile.size;
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

    console.info('[Image Compression] Successfully compressed image:', {
      originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
      compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
      compressionRatio: `${compressionRatio.toFixed(1)}%`,
      fileName: file.name,
    });

    return {
      compressedFile,
      originalSize,
      compressedSize,
      compressionRatio,
    };
  } catch (error) {
    console.error('[Image Compression] Failed to compress image:', {
      error: error instanceof Error ? error.message : String(error),
      fileName: file.name,
    });
    throw error;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB'];
  const index = Math.floor(Math.log(sizeInBytes) / Math.log(1024));
  const value = (sizeInBytes / 1024 ** index).toFixed(2);
  return `${value} ${units[index]}`;
}
