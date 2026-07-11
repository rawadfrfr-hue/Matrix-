/**
 * Utility functions for generating dynamic file thumbnails client-side.
 */

/**
 * Extracts a frame from a local Video File object and returns a base64 JPEG data URL.
 * It seeks to 25% of the video duration or 2 seconds, whichever is more suitable to find a clear frame.
 */
export function generateVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    // Set crossOrigin in case it's used elsewhere
    video.crossOrigin = 'anonymous';

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      // Seek to 25% of duration or 2 seconds, whichever is smaller but meaningful
      const seekTime = Math.min(2, video.duration / 4);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Max thumbnail width or height of 240px for high performance and low storage footprint
        const maxDim = 240;
        let width = video.videoWidth || 320;
        let height = video.videoHeight || 240;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } else {
          reject(new Error('Canvas 2D context not available'));
        }
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    video.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
  });
}

/**
 * Extracts a frame from a remote video URL and returns a base64 JPEG data URL.
 * Uses crossOrigin="anonymous" to avoid taining the canvas.
 */
export function generateVideoThumbnailFromUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = url;

    // Set a timeout to prevent hanging forever
    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Video thumbnail generation timed out'));
    }, 10000);

    video.onloadedmetadata = () => {
      const seekTime = Math.min(2, video.duration / 4);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 240;
        let width = video.videoWidth || 320;
        let height = video.videoHeight || 240;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } else {
          reject(new Error('Canvas 2D context not available'));
        }
      } catch (err) {
        reject(err);
      } finally {
        video.src = '';
      }
    };

    video.onerror = (err) => {
      clearTimeout(timeout);
      video.src = '';
      reject(err);
    };
  });
}
