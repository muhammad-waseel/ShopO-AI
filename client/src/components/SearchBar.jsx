/**
 * SearchBar Component  (Advanced Search: text + autocomplete, voice, image)
 * -------------------------------------------------------------------------
 *  - Text search with autocomplete suggestions (history / trending / popular)
 *  - Voice search: browser Web Speech API; falls back to recording audio and
 *    sending it to the server (Google Speech-to-Text) when unsupported
 *  - Image search: upload/take a photo → server detects the product
 *    (Google Vision or MobileNet) → runs a normal search
 *  - If voice/image services are unavailable the user is told and the text
 *    box stays fully usable (NFR5 graceful degradation)
 *
 * Props:
 *   initialQuery, platforms (array), onSearch(query, searchType), compact
 */

import React, { useEffect, useRef, useState } from 'react';
import { FiSearch, FiMic, FiCamera, FiClock, FiTrendingUp, FiStar, FiLoader, FiX } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './SearchBar.css';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

const sourceIcon = { history: FiClock, trending: FiTrendingUp, popular: FiStar };

const SearchBar = ({ initialQuery = '', onSearch, compact = false, placeholder }) => {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listening, setListening] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [voiceDisabled, setVoiceDisabled] = useState(false);
  const [imageDisabled, setImageDisabled] = useState(false);
  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const fileRef = useRef(null);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const onClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const fetchSuggestions = (text) => {
    clearTimeout(debounceRef.current);
    if (!isAuthenticated) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/products/suggestions', { params: { q: text, limit: 8 } });
        setSuggestions(res.data.suggestions || []);
        setActiveIndex(-1);
      } catch (_) { setSuggestions([]); }
    }, 200);
  };

  const submit = (text, type = 'text') => {
    const q = (text ?? query).trim();
    if (!q) {
      toast.warning('Please enter a product to search for.');
      return;
    }
    setShowSuggestions(false);
    setQuery(q);
    onSearch(q, type);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); submit(suggestions[activeIndex].text); }
    else if (e.key === 'Escape') setShowSuggestions(false);
  };

  // ---------- Voice search ----------
  const startServerRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice search is not supported in this browser. Please type your search.');
      setVoiceDisabled(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, 'voice.webm');
        try {
          const res = await api.post('/products/voice-search', form, { headers: { 'Content-Type': 'multipart/form-data' } });
          toast.success(`Heard: "${res.data.transcript}"`);
          submit(res.data.transcript, 'voice');
        } catch (err) {
          toast.error(err.response?.data?.message || 'Voice search failed. Please type your search.');
          if (err.response?.status === 503) setVoiceDisabled(true);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
      toast.info('Recording… speak now (stops after 5 seconds)');
      setTimeout(() => recorder.state === 'recording' && recorder.stop(), 5000);
    } catch (_) {
      toast.error('Microphone access was denied. Please allow microphone access or type your search.');
    }
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      setListening(false);
      return;
    }
    if (!SpeechRecognition) {
      startServerRecording();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t; else interim += t;
      }
      setQuery((finalText || interim).trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.error('Microphone access was denied. Please allow it or type your search.');
      else if (e.error === 'network') { toast.warning('Speech service unreachable — trying server transcription.'); startServerRecording(); }
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast.error('Voice search failed. Please type your search.');
      else if (e.error === 'no-speech') toast.info("Didn't catch that — please try again.");
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) submit(finalText, 'voice');
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  // ---------- Image search ----------
  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG or WEBP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB.');
      return;
    }
    setImageBusy(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post('/products/image-search', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.warning) toast.warning(res.data.warning);
      toast.success(`Detected: "${res.data.query}" (${res.data.engine})`);
      submit(res.data.query, 'image');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Image search failed. Please use text search.');
      if (err.response?.status === 503) setImageDisabled(true);
    } finally {
      setImageBusy(false);
    }
  };

  const requireLogin = (fn) => () => {
    if (!isAuthenticated) { toast.info('Please login to use voice and image search.'); return; }
    fn();
  };

  return (
    <div className={`searchbar ${compact ? 'compact' : ''}`} ref={wrapperRef}>
      <form className="searchbar-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FiSearch className="searchbar-icon" />
        <input
          type="text"
          className="searchbar-input"
          placeholder={listening ? 'Listening…' : (placeholder || 'Search for a product… (e.g., iPhone 15, Samsung Galaxy S24)')}
          value={query}
          onChange={(e) => { setQuery(e.target.value); fetchSuggestions(e.target.value); setShowSuggestions(true); }}
          onFocus={() => { fetchSuggestions(query); setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
          aria-label="Search products"
          autoComplete="off"
        />
        {query && (
          <button type="button" className="searchbar-tool" onClick={() => { setQuery(''); fetchSuggestions(''); }} title="Clear">
            <FiX />
          </button>
        )}
        <button
          type="button"
          className={`searchbar-tool ${listening ? 'listening' : ''}`}
          onClick={requireLogin(toggleVoice)}
          disabled={voiceDisabled}
          title={voiceDisabled ? 'Voice search unavailable — please type' : 'Search by voice'}
          aria-label="Search by voice"
        >
          <FiMic />
        </button>
        <button
          type="button"
          className="searchbar-tool"
          onClick={requireLogin(() => fileRef.current?.click())}
          disabled={imageBusy || imageDisabled}
          title={imageDisabled ? 'Image search unavailable — please type' : 'Search by image'}
          aria-label="Search by image"
        >
          {imageBusy ? <FiLoader className="spin" /> : <FiCamera />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImage} style={{ display: 'none' }} />
        <button type="submit" className="searchbar-submit">Search</button>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="searchbar-suggestions" role="listbox">
          {suggestions.map((s, i) => {
            const Icon = sourceIcon[s.source] || FiSearch;
            return (
              <li
                key={s.text}
                role="option"
                aria-selected={i === activeIndex}
                className={i === activeIndex ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); submit(s.text); }}
              >
                <Icon className={`sugg-icon ${s.source}`} />
                <span>{s.text}</span>
                <small>{s.source === 'history' ? 'recent' : s.source}</small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
