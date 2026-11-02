/**
 * Speech-to-Text Service  (FR7, server-side fallback)
 * ---------------------------------------------------
 * The browser's Web Speech API is used first (Chrome, Edge, Safari).
 * Browsers without it (e.g. Firefox) record audio and send it here; we
 * transcribe it with Google Cloud Speech-to-Text if GOOGLE_STT_API_KEY
 * (or GOOGLE_VISION_API_KEY — the same Google API key works if both APIs
 * are enabled) is configured.
 */

const axios = require('axios');
const { ServiceUnavailableError } = require('./imageSearch');

const getKey = () => process.env.GOOGLE_STT_API_KEY || process.env.GOOGLE_VISION_API_KEY;

const transcribe = async (buffer, mimetype = 'audio/webm') => {
  const key = getKey();
  if (!key) throw new ServiceUnavailableError('Voice search is not available in this browser. Please type your search instead.');
  const encoding = /ogg/.test(mimetype) ? 'OGG_OPUS' : /wav/.test(mimetype) ? 'LINEAR16' : 'WEBM_OPUS';
  try {
    const { data } = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
      {
        config: { encoding, languageCode: process.env.STT_LANGUAGE || 'en-US', enableAutomaticPunctuation: false, ...(encoding !== 'LINEAR16' && { sampleRateHertz: 48000 }) },
        audio: { content: buffer.toString('base64') }
      },
      { timeout: 10000 }
    );
    const alt = data.results?.[0]?.alternatives?.[0];
    return { transcript: (alt?.transcript || '').trim(), confidence: Math.round((alt?.confidence || 0) * 100), engine: 'Google Speech-to-Text' };
  } catch (err) {
    throw new ServiceUnavailableError('Voice transcription service is unavailable. Please type your search instead.');
  }
};

module.exports = { transcribe };
