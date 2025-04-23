/**
 * Utility functions for creating zip files from in-browser files
 */

/**
 * Creates a zip file from an array of file objects
 * @param {Array} files - Array of file objects with name and content properties
 * @returns {Promise<Blob>} - A promise that resolves to a Blob containing the zip file
 */
export const createZipFromFiles = async (files) => {
  // Dynamically import JSZip to reduce initial bundle size
  const JSZip = (await import('jszip')).default;
  
  const zip = new JSZip();
  
  // Add each file to the zip
  files.forEach(file => {
    zip.file(file.name, file.content);
  });
  
  // Generate the zip file as a blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9 // Maximum compression
    }
  });
  
  return blob;
};

/**
 * Creates a File object from a zip blob
 * @param {Blob} zipBlob - The zip file blob
 * @param {string} fileName - The name to give the file
 * @returns {File} - A File object that can be used with FormData
 */
export const createFileFromZip = (zipBlob, fileName) => {
  return new File([zipBlob], fileName, { type: 'application/zip' });
};

export default {
  createZipFromFiles,
  createFileFromZip
};
