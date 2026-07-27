'use client';
// Live webcam capture — works on desktop and mobile where <input capture> won't
// offer a camera (desktop) or where the operator wants a choice. Emits a JPEG File
// identical in shape to a file-picker selection, so callers reuse one handler.
import { useCallback, useEffect, useRef, useState } from 'react';

export default function CameraCapture({ onCapture, label = 'Camera' }: { onCapture: (file: File) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => { stop(); setOpen(false); setErr(''); }, [stop]);

  useEffect(() => () => stop(), [stop]); // stop camera if unmounted

  async function start() {
    setErr(''); setOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) { setErr('Camera not supported on this device.'); return; }
    try {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch {
      setErr('Camera permission denied or unavailable. Use "Choose file" instead.');
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' }));
      close();
    }, 'image/jpeg', 0.92);
  }

  return (
    <>
      <button type="button" onClick={start}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
        📷 {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            {err ? (
              <p className="py-8 text-center text-sm text-red-600">{err}</p>
            ) : (
              <video ref={videoRef} playsInline muted className="mb-3 w-full rounded-lg bg-black" />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="btn-ghost">Cancel</button>
              {!err && <button type="button" onClick={capture} className="btn-primary">Capture</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
