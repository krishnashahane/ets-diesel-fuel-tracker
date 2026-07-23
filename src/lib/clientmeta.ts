// Client-side capture helpers for workflow location + device tracking. No deps.
import type { GeoPoint, DeviceInfo } from './types';

export function parseDevice(ua: string): DeviceInfo {
  const s = ua || '';
  const os =
    /Windows NT 10/.test(s) ? 'Windows 10/11' :
    /Windows/.test(s) ? 'Windows' :
    /Android/.test(s) ? 'Android' :
    /(iPhone|iPad|iPod)/.test(s) ? 'iOS' :
    /Mac OS X/.test(s) ? 'macOS' :
    /Linux/.test(s) ? 'Linux' : 'Unknown';
  const browser =
    /Edg\//.test(s) ? 'Edge' :
    /OPR\//.test(s) ? 'Opera' :
    /Chrome\//.test(s) && !/Chromium/.test(s) ? 'Chrome' :
    /Firefox\//.test(s) ? 'Firefox' :
    /Safari\//.test(s) && !/Chrome/.test(s) ? 'Safari' : 'Unknown';
  const deviceType: DeviceInfo['deviceType'] =
    /iPad|Tablet/.test(s) ? 'tablet' :
    /Mobi|Android|iPhone/.test(s) ? 'mobile' : 'desktop';
  return { ua: s.slice(0, 400), browser, os, deviceType };
}

export function getDevice(): DeviceInfo {
  return parseDevice(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

// Resolves with a GeoPoint. Never rejects — records permission/availability status.
export function getGeo(timeoutMs = 8000): Promise<GeoPoint> {
  const now = () => new Date().toISOString();
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ lat: 0, lng: 0, accuracy: 0, ts: now(), status: 'unavailable' });
      return;
    }
    let done = false;
    const finish = (g: GeoPoint) => { if (!done) { done = true; resolve(g); } };
    navigator.geolocation.getCurrentPosition(
      (p) => finish({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy || 0), ts: now(), status: 'ok' }),
      (e) => finish({ lat: 0, lng: 0, accuracy: 0, ts: now(), status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
    setTimeout(() => finish({ lat: 0, lng: 0, accuracy: 0, ts: now(), status: 'unavailable' }), timeoutMs + 500);
  });
}

// Downscale + compress an image File to a JPEG data URL for storage/OCR. Bounded size.
export function fileToDataURL(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
