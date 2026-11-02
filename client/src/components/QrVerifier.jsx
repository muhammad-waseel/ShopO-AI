/**
 * QrVerifier — QR Code Scanning & Verification (FR5)
 * --------------------------------------------------
 * Three ways to check a code:
 *   1. Live camera scan (getUserMedia + jsQR, decoded in the browser)
 *   2. Upload a photo of the label (decoded on the server)
 *   3. Type the code manually
 * The server looks the code up in the authenticity registry and returns
 * "Genuine" or "Potential Counterfeit" with reasons and product details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { FiCamera, FiCameraOff, FiUpload, FiCheckCircle, FiAlertOctagon, FiMaximize, FiDownload } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api, { API_BASE_URL } from '../services/api';

const assetUrl = (p) => `${API_BASE_URL}${p.replace(/^\/api/, '')}`;

const QrVerifier = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const fileRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null);
  const [demo, setDemo] = useState([]);

  useEffect(() => {
    api.get('/verify/demo-codes').then(r => setDemo(r.data.codes)).catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const verify = async (code) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post('/verify/qr', { code });
      setResult(res.data);
      toast[res.data.isGenuine ? 'success' : 'warning'](res.data.status);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        stopCamera();
        if (navigator.vibrate) navigator.vibrate(100);
        verify(code.data);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera is not available in this browser. Upload a photo or type the code instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setResult(null);
      setScanning(true);
      // wait a tick for the <video> to mount
      setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', true);
        videoRef.current.play();
        rafRef.current = requestAnimationFrame(tick);
      }, 50);
    } catch (_) {
      toast.error('Camera permission was denied. Upload a photo of the QR code instead.');
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopCamera();
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post('/verify/qr-image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      toast[res.data.isGenuine ? 'success' : 'warning'](res.data.status);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not read the QR code');
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

  return (
    <div className="qr-wrap">
      <div className="qr-panel">
        <h3><FiMaximize /> Scan product QR code</h3>
        <div className="qr-video-box">
          {scanning ? (
            <>
              <video ref={videoRef} muted />
              <div className="qr-frame" />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <FiCamera size={40} />
              <p>Point your camera at the QR code on the product or its packaging.</p>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
        <div className="qr-actions">
          {scanning
            ? <button className="btn-secondary" onClick={stopCamera}><FiCameraOff /> Stop camera</button>
            : <button className="btn-primary" onClick={startCamera} disabled={busy}><FiCamera /> Start camera</button>}
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}><FiUpload /> Upload photo</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadPhoto} style={{ display: 'none' }} />
        </div>
        <form className="qr-manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) verify(manual.trim()); }}>
          <input placeholder="…or type the code printed under the QR (e.g. SHOPO-NIKE-AM90-0001)" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy || !manual.trim()}>Verify</button>
        </form>
      </div>

      <div className="qr-panel">
        <h3>Result</h3>
        {busy ? <p className="muted">Checking the authenticity database…</p> : result ? (
          <div className={`qr-result ${result.isGenuine ? 'genuine' : 'fake'}`}>
            <div className="qr-result-head">
              {result.isGenuine ? <FiCheckCircle size={36} /> : <FiAlertOctagon size={36} />}
              <div>
                <h2>{result.status}</h2>
                <small>Confidence {result.confidence}% · code <code>{result.code || '—'}</code></small>
              </div>
            </div>
            <ul>{(result.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
            {result.product && (
              <div className="qr-detail-grid">
                <div><span>Product</span>{result.product.productName}</div>
                <div><span>Brand</span>{result.product.brand}</div>
                <div><span>Manufacturer</span>{result.product.manufacturer || '—'}</div>
                <div><span>Batch</span>{result.product.batchNumber || '—'}</div>
                <div><span>Manufactured</span>{fmtDate(result.product.manufacturedAt)}</div>
                <div><span>First scanned</span>{fmtDate(result.product.firstScannedAt)}</div>
                <div><span>Total scans</span>{result.product.scanCount} by {result.product.uniqueScanners} account(s)</div>
                {result.product.authorizedSellers?.length > 0 && (
                  <div><span>Authorized sellers</span>{result.product.authorizedSellers.join(', ')}</div>
                )}
              </div>
            )}
            {!result.isGenuine && <p style={{ marginTop: 10, fontSize: '.88rem' }}><strong>Advice:</strong> do not buy, or ask the seller for proof of purchase from an authorized distributor.</p>}
          </div>
        ) : <p className="muted">Scan, upload or type a code to see whether the product is genuine.</p>}

        {demo.length > 0 && (
          <>
            <h3 style={{ marginTop: 20 }}>Demo codes</h3>
            <p className="muted" style={{ marginBottom: 10 }}>Click to verify, or open the image and scan it with your camera. Try a made-up code like <code>FAKE-12345</code> too.</p>
            <div className="qr-demo">
              {demo.map(d => (
                <div key={d.code} className="qr-demo-item" onClick={() => verify(d.code)} title="Verify this code">
                  <img src={assetUrl(d.imageUrl)} alt={d.code} loading="lazy" />
                  <b>{d.brand}</b>
                  <span>{d.status === 'revoked' ? 'revoked code' : d.productName}</span>
                  <div>
                    <a href={assetUrl(d.imageUrl)} download={`${d.code}.png`} onClick={(e) => e.stopPropagation()} title="Download"><FiDownload /></a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QrVerifier;
