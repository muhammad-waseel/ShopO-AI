/**
 * Image Search Service  (FR6)
 * ---------------------------
 * Turns an uploaded photo into a text query that is then run through the
 * normal multi-platform search.
 *
 * Engines (in order):
 *   1. Google Cloud Vision  — if GOOGLE_VISION_API_KEY is set.
 *      Uses WEB_DETECTION (best-guess label, e.g. "nike air max 90"),
 *      LOGO_DETECTION and LABEL_DETECTION.
 *   2. MobileNet (TensorFlow.js) — local CNN, returns ImageNet classes
 *      (e.g. "running shoe").
 *   3. Neither available → throws ServiceUnavailableError so the API
 *      can tell the user to fall back to text search (NFR5).
 */

const axios = require('axios');

class ServiceUnavailableError extends Error {
  constructor(msg) { super(msg); this.status = 503; }
}

const cleanLabel = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const searchWithGoogleVision = async (buffer) => {
  const { data } = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      requests: [{
        image: { content: buffer.toString('base64') },
        features: [
          { type: 'WEB_DETECTION', maxResults: 5 },
          { type: 'LOGO_DETECTION', maxResults: 3 },
          { type: 'LABEL_DETECTION', maxResults: 8 }
        ]
      }]
    },
    { timeout: 10000 }
  );
  const r = (data.responses || [])[0] || {};
  if (r.error) throw new Error(r.error.message);
  const bestGuess = r.webDetection?.bestGuessLabels?.[0]?.label;
  const logos = (r.logoAnnotations || []).map(l => l.description);
  const labels = (r.labelAnnotations || []).map(l => ({ label: l.description, confidence: Math.round(l.score * 100) }));
  const generic = new Set(['product', 'font', 'material property', 'rectangle', 'electronic device', 'gadget', 'technology']);
  const usefulLabel = labels.find(l => !generic.has(l.label.toLowerCase()));

  let query = cleanLabel(bestGuess);
  if (!query && usefulLabel) query = cleanLabel(`${logos[0] || ''} ${usefulLabel.label}`);
  if (logos[0] && query && !query.includes(logos[0].toLowerCase())) query = `${cleanLabel(logos[0])} ${query}`;
  return { query, labels, logos, engine: 'Google Cloud Vision' };
};

// ImageNet class → shopping-friendly search term
const IMAGENET_TO_QUERY = {
  'running shoe': 'running shoes', 'cellular telephone': 'smartphone', 'notebook': 'laptop',
  'laptop': 'laptop', 'digital watch': 'smart watch', 'analog clock': 'wall clock',
  'sunglasses': 'sunglasses', 'sunglass': 'sunglasses', 'backpack': 'backpack',
  'jersey': 't-shirt', 'sweatshirt': 'hoodie', 'jean': 'jeans', 'mouse': 'computer mouse',
  'computer keyboard': 'keyboard', 'loudspeaker': 'bluetooth speaker', 'iPod': 'mp3 player',
  'reflex camera': 'dslr camera', 'joystick': 'game controller', 'wallet': 'wallet',
  'perfume': 'perfume', 'lipstick': 'lipstick', 'lotion': 'body lotion', 'monitor': 'monitor',
  'desktop computer': 'desktop computer', 'television': 'smart tv', 'hair drier': 'hair dryer'
};

const searchWithMobileNet = async (buffer, mimetype) => {
  const { classifyImage } = require('../ai/imageVerifier');
  const preds = await classifyImage(buffer, mimetype);
  if (!preds || !preds.length) return null;
  const labels = preds.map(p => ({ label: p.className, confidence: Math.round(p.probability * 100) }));
  // className can be "notebook, notebook computer" — take the first synonym
  const top = preds[0].className.split(',')[0].trim();
  const query = IMAGENET_TO_QUERY[top] || cleanLabel(top);
  return { query, labels, logos: [], engine: 'MobileNet v2 (TensorFlow.js)' };
};

/**
 * @returns {Promise<{query, labels, logos, engine, warning?}>}
 */
const imageToQuery = async (buffer, mimetype) => {
  let warning = null;
  if (process.env.GOOGLE_VISION_API_KEY) {
    try {
      const r = await searchWithGoogleVision(buffer);
      if (r.query) return r;
    } catch (err) {
      warning = `Google Vision unavailable (${err.message}); used local model instead.`;
      console.warn(`⚠️ ${warning}`);
    }
  }
  const local = await searchWithMobileNet(buffer, mimetype).catch(err => {
    console.warn(`⚠️ MobileNet image search failed: ${err.message}`);
    return null;
  });
  if (local && local.query) return { ...local, warning };
  throw new ServiceUnavailableError('Image search is temporarily unavailable. Please use text search instead.');
};

module.exports = { imageToQuery, ServiceUnavailableError, cleanLabel };
