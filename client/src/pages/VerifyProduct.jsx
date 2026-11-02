/**
 * Verify Product Page
 * -------------------
 * Allows users to upload a product image, select a category,
 * and get an AI authenticity verification with confidence score.
 */

import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import QrVerifier from '../components/QrVerifier';
import { FiImage, FiMaximize } from 'react-icons/fi';
import { FiUploadCloud, FiX, FiCheckCircle, FiAlertTriangle, FiAlertCircle, FiCpu, FiMonitor, FiShoppingBag } from 'react-icons/fi';
import { GiLipstick, GiWatch } from 'react-icons/gi';
import api from '../services/api';
import { toast } from 'react-toastify';
import { getScoreColor } from '../utils/helpers';
import './VerifyProduct.css';

const CATEGORIES = [
    { id: 'electronics', name: 'Electronics', icon: FiMonitor, description: 'Phones, laptops, gadgets' },
    { id: 'fashion', name: 'Fashion', icon: FiShoppingBag, description: 'Clothing, shoes, apparel' },
    { id: 'cosmetics', name: 'Cosmetics', icon: GiLipstick, description: 'Beauty, skincare, makeup' },
    { id: 'accessories', name: 'Accessories', icon: GiWatch, description: 'Watches, bags, jewelry' }
];

const VerifyProduct = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const mode = searchParams.get('mode') === 'qr' ? 'qr' : 'image';
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    // Handle file selection
    const handleFileSelect = (file) => {
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Only JPG, PNG, and WEBP images are supported.');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('Image must be smaller than 10MB.');
            return;
        }

        setSelectedFile(file);
        setResult(null);

        // Create preview URL
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
    };

    // Drag and drop handlers
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleInputChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    // Remove selected file
    const removeFile = () => {
        setSelectedFile(null);
        setPreview(null);
        setResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Submit for verification
    const handleVerify = async () => {
        if (!selectedFile) {
            toast.warning('Please upload an image first.');
            return;
        }
        if (!selectedCategory) {
            toast.warning('Please select a product category.');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('category', selectedCategory);

            const response = await api.post('/analysis/verify-image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setResult(response.data);
            toast.success('Verification complete!');
        } catch (error) {
            const msg = error.response?.data?.message || 'Verification failed. Please try again.';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    // Status icon based on result
    const getStatusIcon = (status) => {
        switch (status) {
            case 'Genuine': return <FiCheckCircle size={28} />;
            case 'Counterfeit': return <FiAlertCircle size={28} />;
            default: return <FiAlertTriangle size={28} />;
        }
    };

    const getStatusClass = (status) => {
        switch (status) {
            case 'Genuine': return 'status-genuine';
            case 'Counterfeit': return 'status-counterfeit';
            default: return 'status-inconclusive';
        }
    };

    return (
        <div className="verify-page">
            {/* Page Header */}
            <div className="verify-header">
                <div className="verify-header-content">
                    <FiCpu size={28} />
                    <div>
                        <h1>Product Verification</h1>
                        <p>Scan the product's QR code or upload a product/logo image to check its authenticity</p>
                    </div>
                </div>
                <div className="verify-tabs">
                    <button className={mode === 'qr' ? 'active' : ''} onClick={() => setSearchParams({ mode: 'qr' })}>
                        <FiMaximize /> QR Code
                    </button>
                    <button className={mode === 'image' ? 'active' : ''} onClick={() => setSearchParams({})}>
                        <FiImage /> Image / Logo
                    </button>
                </div>
            </div>

            {mode === 'qr' ? <QrVerifier /> : (
            <div className="verify-container">
                {/* Left Panel: Upload & Category */}
                <div className="verify-input-panel">
                    {/* Image Upload */}
                    <div className="verify-card">
                        <h3 className="card-title">1. Upload Product Image</h3>
                        <p className="card-subtitle">Supports JPG, PNG, WEBP (max 10MB)</p>

                        {!selectedFile ? (
                            <div
                                className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <FiUploadCloud size={48} className="drop-icon" />
                                <p className="drop-text">Drag & drop your image here</p>
                                <p className="drop-subtext">or click to browse files</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                    onChange={handleInputChange}
                                    style={{ display: 'none' }}
                                />
                            </div>
                        ) : (
                            <div className="preview-container">
                                <div className="preview-image-wrapper">
                                    <img src={preview} alt="Preview" className="preview-image" />
                                    <button className="remove-btn" onClick={removeFile}>
                                        <FiX size={16} />
                                    </button>
                                </div>
                                <div className="file-info">
                                    <span className="file-name">{selectedFile.name}</span>
                                    <span className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Category Selection */}
                    <div className="verify-card">
                        <h3 className="card-title">2. Select Category</h3>
                        <p className="card-subtitle">Choose the product type for better analysis</p>

                        <div className="category-grid">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    className={`category-item ${selectedCategory === cat.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    <cat.icon size={24} />
                                    <span className="cat-name">{cat.name}</span>
                                    <span className="cat-desc">{cat.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Verify Button */}
                    <button
                        className="verify-btn"
                        onClick={handleVerify}
                        disabled={!selectedFile || !selectedCategory || loading}
                    >
                        {loading ? (
                            <>
                                <div className="btn-spinner"></div>
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <FiCpu size={20} />
                                Verify Product
                            </>
                        )}
                    </button>
                </div>

                {/* Right Panel: Results */}
                <div className="verify-results-panel">
                    <div className="verify-card results-card">
                        <h3 className="card-title">AI Analysis Report</h3>

                        {!result && !loading ? (
                            <div className="results-placeholder">
                                <FiCpu size={48} />
                                <p>Upload an image and select a category, then click "Verify Product" to see the AI analysis report.</p>
                            </div>
                        ) : loading ? (
                            <div className="results-loading">
                                <div className="analysis-spinner"></div>
                                <p>Running AI analysis on your image...</p>
                                <p className="loading-subtext">Comparing against product database</p>
                            </div>
                        ) : result ? (
                            <div className="results-content">
                                {/* Status Badge */}
                                <div className={`status-badge ${getStatusClass(result.status)}`}>
                                    {getStatusIcon(result.status)}
                                    <div>
                                        <span className="status-label">{result.status}</span>
                                        <span className="status-category">{result.category}</span>
                                    </div>
                                </div>

                                {/* Confidence Score */}
                                <div className="confidence-section">
                                    <h4>Confidence Score</h4>
                                    <div className="confidence-bar-wrapper">
                                        <div className="confidence-bar">
                                            <div
                                                className="confidence-fill"
                                                style={{
                                                    width: `${result.confidenceScore}%`,
                                                    background: getScoreColor(result.confidenceScore)
                                                }}
                                            ></div>
                                        </div>
                                        <span
                                            className="confidence-value"
                                            style={{ color: getScoreColor(result.confidenceScore) }}
                                        >
                                            {result.confidenceScore}%
                                        </span>
                                    </div>
                                </div>

                                {/* Explanation */}
                                <div className="explanation-section">
                                    <h4>Analysis Summary</h4>
                                    <p>{result.statusExplanation}</p>
                                </div>

                                {/* Model Info */}
                                <div className="model-info-section">
                                    <span className="model-badge">🧠 {result.modelUsed || 'AI Model'}</span>
                                    {result.processingTimeMs && (
                                        <span className="processing-time">{result.processingTimeMs}ms</span>
                                    )}
                                </div>

                                {/* MobileNet Classifications */}
                                {result.classifications && result.classifications.length > 0 && (
                                    <div className="breakdown-section">
                                        <h4>Image Classifications</h4>
                                        {result.classifications.map((cls, idx) => (
                                            <div key={idx} className="breakdown-item">
                                                <div className="breakdown-header">
                                                    <span>{cls.className}</span>
                                                    <span style={{ color: getScoreColor(cls.probability) }}>
                                                        {cls.probability}%
                                                    </span>
                                                </div>
                                                <div className="breakdown-bar">
                                                    <div
                                                        className="breakdown-fill"
                                                        style={{
                                                            width: `${cls.probability}%`,
                                                            background: getScoreColor(cls.probability)
                                                        }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* File Info */}
                                {result.fileInfo && (
                                    <div className="metadata-section">
                                        <h4>Image Info</h4>
                                        <div className="metadata-grid">
                                            <div className="meta-item">
                                                <span className="meta-label">File</span>
                                                <span className="meta-value">{result.fileInfo.originalName}</span>
                                            </div>
                                            <div className="meta-item">
                                                <span className="meta-label">Size</span>
                                                <span className="meta-value">{result.fileInfo.fileSizeFormatted}</span>
                                            </div>
                                            <div className="meta-item">
                                                <span className="meta-label">Format</span>
                                                <span className="meta-value">{result.fileInfo.mimetype}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            )}
        </div>
    );
};

export default VerifyProduct;
