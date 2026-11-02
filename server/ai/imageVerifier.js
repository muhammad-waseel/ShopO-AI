/**
 * Image Verifier (TensorFlow.js + MobileNet)
 * -------------------------------------------
 * Uses a pre-trained MobileNet CNN model to classify product images.
 * MobileNet is trained on ImageNet (1000 categories) and can identify
 * whether an image contains a real product photo vs. screenshots,
 * text, or unrelated content.
 * 
 * Authenticity logic:
 *   - If MobileNet recognizes a product-related class with high
 *     confidence → higher authenticity score
 *   - If classification is unclear, low confidence, or matches
 *     non-product classes → lower score
 *   - Combined with file metadata quality checks
 * 
 * The model is loaded once and cached for subsequent calls.
 */

let tf;
let mobilenet;
let model = null;

/**
 * Dynamically load TensorFlow.js — handle import gracefully
 */
const loadDependencies = async () => {
    if (!tf) {
        try {
            tf = require('@tensorflow/tfjs-node');
        } catch (e) {
            console.warn('⚠️ @tensorflow/tfjs-node not available, falling back to heuristic mode');
            tf = null;
        }
    }
    if (!mobilenet) {
        try {
            mobilenet = require('@tensorflow-models/mobilenet');
        } catch (e) {
            console.warn('⚠️ @tensorflow-models/mobilenet not available, falling back to heuristic mode');
            mobilenet = null;
        }
    }
};

/**
 * Load MobileNet model (cached after first call)
 */
const getModel = async () => {
    await loadDependencies();
    if (!tf || !mobilenet) return null;

    if (!model) {
        console.log('🧠 Loading MobileNet model (first time — may take a few seconds)...');
        model = await mobilenet.load({ version: 2, alpha: 1.0 });
        console.log('✅ MobileNet model loaded and cached.');
    }
    return model;
};

/**
 * Product-related ImageNet categories — if MobileNet returns these,
 * the image likely shows a real product photo
 */
const PRODUCT_CATEGORIES = {
    electronics: [
        'cellular telephone', 'cell phone', 'cellphone', 'smartphone',
        'laptop', 'notebook', 'computer', 'desktop computer',
        'monitor', 'screen', 'television', 'tv',
        'iPod', 'mouse', 'keyboard', 'remote control',
        'loudspeaker', 'speaker', 'headphone', 'earphone',
        'digital watch', 'digital clock', 'calculator',
        'printer', 'scanner', 'modem', 'hard disc',
        'joystick', 'game controller', 'console',
        'camera', 'reflex camera', 'Polaroid camera',
        'projector', 'microphone', 'tape player',
        'power drill', 'electric fan'
    ],
    fashion: [
        'jersey', 't-shirt', 'tee shirt', 'shirt',
        'suit', 'jean', 'trouser', 'dress',
        'gown', 'cloak', 'poncho', 'cardigan',
        'sweatshirt', 'pullover', 'coat', 'jacket',
        'fur coat', 'kimono', 'bikini', 'swimming trunks',
        'miniskirt', 'overskirt', 'sarong', 'pajama',
        'running shoe', 'sneaker', 'shoe', 'boot',
        'sandal', 'clog', 'loafer', 'slipper',
        'sock', 'stocking', 'hat', 'cowboy hat',
        'sombrero', 'bonnet', 'cap'
    ],
    cosmetics: [
        'lotion', 'sunscreen', 'cream', 'perfume',
        'lipstick', 'face powder', 'makeup',
        'hair spray', 'bottle', 'soap dispenser',
        'cosmetic', 'moisturizer', 'foundation'
    ],
    accessories: [
        'sunglasses', 'sunglass', 'watch', 'digital watch',
        'analog clock', 'necklace', 'chain',
        'ring', 'bracelet', 'wallet', 'purse',
        'handbag', 'backpack', 'bag', 'briefcase',
        'suitcase', 'umbrella', 'belt', 'buckle',
        'bow tie', 'neck brace', 'bolo tie',
        'hair slide', 'band aid', 'stethoscope'
    ]
};

/**
 * Check if a MobileNet class name matches product categories
 */
const getProductMatch = (className, category) => {
    const lower = className.toLowerCase();

    // Check specific category first
    const categoryList = PRODUCT_CATEGORIES[category] || [];
    for (const keyword of categoryList) {
        if (lower.includes(keyword.toLowerCase())) {
            return { match: true, specific: true, keyword };
        }
    }

    // Check all categories
    for (const [cat, keywords] of Object.entries(PRODUCT_CATEGORIES)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword.toLowerCase())) {
                return { match: true, specific: false, keyword, matchedCategory: cat };
            }
        }
    }

    return { match: false };
};

/**
 * Verify a product image using MobileNet classification.
 * 
 * @param {Object} params
 *   @param {Buffer} params.imageBuffer - Raw image data buffer
 *   @param {number} params.fileSize - File size in bytes
 *   @param {string} params.mimetype - MIME type of the image
 *   @param {string} params.originalName - Original filename
 *   @param {string} params.category - Product category
 * @returns {Promise<Object>} Verification result
 */
const verifyProductImage = async ({ imageBuffer, fileSize, mimetype, originalName, category = 'electronics' }) => {
    const startTime = Date.now();

    // Try ML-based verification
    const mlModel = await getModel();

    let predictions = [];
    let mlAvailable = false;

    if (mlModel && tf && imageBuffer) {
        try {
            // Convert WebP to PNG since TF.js decodeImage doesn't support WebP
            let processedBuffer = imageBuffer;
            if (mimetype === 'image/webp' || (originalName && originalName.toLowerCase().endsWith('.webp'))) {
                console.log(`  🔄 Converting WebP to PNG for MobileNet...`);
                const sharp = require('sharp');
                processedBuffer = await sharp(imageBuffer).png().toBuffer();
            }

            // Decode image to tensor
            const imageTensor = tf.node.decodeImage(processedBuffer, 3);

            // Classify the image — get top 5 predictions
            predictions = await mlModel.classify(imageTensor, 5);

            // Clean up tensor
            imageTensor.dispose();

            mlAvailable = true;
            console.log(`  🔍 MobileNet predictions:`, predictions.map(p =>
                `${p.className} (${(p.probability * 100).toFixed(1)}%)`
            ).join(', '));
        } catch (err) {
            console.warn(`  ⚠️ MobileNet classification failed:`, err.message);
        }
    }

    // Analyze predictions
    let confidenceScore = 50; // Base score
    let status = 'Inconclusive';
    let statusExplanation = '';
    let modelUsed = mlAvailable ? 'MobileNet v2 (TensorFlow.js)' : 'Heuristic Analysis';
    let classificationResults = [];

    if (mlAvailable && predictions.length > 0) {
        classificationResults = predictions.map(p => ({
            className: p.className,
            probability: Math.round(p.probability * 100 * 10) / 10
        }));

        // Check if any top prediction matches product categories
        let bestMatch = null;
        let highestMatchProb = 0;

        for (const pred of predictions) {
            const matchResult = getProductMatch(pred.className, category);
            if (matchResult.match && pred.probability > highestMatchProb) {
                bestMatch = { ...matchResult, probability: pred.probability, className: pred.className };
                highestMatchProb = pred.probability;
            }
        }

        // Top prediction confidence
        const topConfidence = predictions[0].probability;

        if (bestMatch) {
            // Product category detected
            if (bestMatch.specific) {
                // Exact category match (e.g., "cellular telephone" for electronics)
                confidenceScore = Math.min(95, Math.round(60 + bestMatch.probability * 35));
                status = confidenceScore >= 70 ? 'Genuine' : 'Inconclusive';
                statusExplanation = `MobileNet identified this as "${bestMatch.className}" with ${(bestMatch.probability * 100).toFixed(1)}% confidence. ` +
                    `This matches the "${category}" category. The image appears to show an authentic product photo.`;
            } else {
                // Related category match
                confidenceScore = Math.min(85, Math.round(45 + bestMatch.probability * 30));
                status = confidenceScore >= 65 ? 'Genuine' : 'Inconclusive';
                statusExplanation = `MobileNet identified this as "${bestMatch.className}" which is related to "${bestMatch.matchedCategory}" products. ` +
                    `Partial category match — the image may show a genuine product but in a different category than expected.`;
            }
        } else {
            // No product category match
            if (topConfidence > 0.5) {
                // High confidence but not a product
                confidenceScore = Math.max(20, Math.round(40 - topConfidence * 20));
                status = 'Counterfeit';
                statusExplanation = `MobileNet classified this as "${predictions[0].className}" with ${(topConfidence * 100).toFixed(1)}% confidence. ` +
                    `This does not appear to be a ${category} product image. The image may be a screenshot, stock photo, or unrelated content.`;
            } else {
                // Low confidence — unclear
                confidenceScore = 40;
                status = 'Inconclusive';
                statusExplanation = `MobileNet could not confidently classify this image. Top prediction: "${predictions[0].className}" at ${(topConfidence * 100).toFixed(1)}% confidence. ` +
                    `The image quality or content may be insufficient for reliable verification.`;
            }
        }
    } else {
        // Fallback: heuristic analysis (no ML model available)
        const qualityScore = calculateFileQualityScore(fileSize, mimetype);
        confidenceScore = qualityScore;
        status = qualityScore >= 60 ? 'Inconclusive' : 'Counterfeit';
        statusExplanation = `ML model unavailable — using heuristic analysis. File quality score: ${qualityScore}/100. ` +
            `For accurate results, ensure TensorFlow.js is properly installed.`;
        modelUsed = 'Heuristic (fallback)';
    }

    const processingTime = Date.now() - startTime;

    return {
        confidenceScore,
        status,
        statusExplanation,
        modelUsed,
        processingTimeMs: processingTime,
        category,
        classifications: classificationResults,
        fileInfo: {
            originalName: originalName || 'unknown',
            mimetype: mimetype || 'unknown',
            fileSize: fileSize || 0,
            fileSizeFormatted: fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : 'unknown'
        }
    };
};

/**
 * Heuristic fallback — basic quality score from file metadata
 */
const calculateFileQualityScore = (fileSize, mimetype) => {
    let score = 50;

    // File size scoring
    if (fileSize > 500000) score += 15;       // > 500KB — likely high quality
    else if (fileSize > 100000) score += 10;  // > 100KB — decent quality
    else if (fileSize > 50000) score += 5;    // > 50KB — okay
    else score -= 10;                         // Very small — likely thumbnail/low quality

    // Format scoring
    if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') score += 5;
    else if (mimetype === 'image/png') score += 5;
    else if (mimetype === 'image/webp') score += 3;

    return Math.max(0, Math.min(100, score));
};

/**
 * Classify an arbitrary image with MobileNet (used by image search).
 * Returns an array of { className, probability } or null if the model is unavailable.
 */
const classifyImage = async (imageBuffer, mimetype = 'image/jpeg') => {
    const mlModel = await getModel();
    if (!mlModel || !tf || !imageBuffer) return null;
    let buf = imageBuffer;
    if (mimetype === 'image/webp') {
        const sharp = require('sharp');
        buf = await sharp(imageBuffer).png().toBuffer();
    }
    const tensor = tf.node.decodeImage(buf, 3);
    try {
        const preds = await mlModel.classify(tensor, 5);
        return preds.map(p => ({ className: p.className, probability: p.probability }));
    } finally {
        tensor.dispose();
    }
};

module.exports = { verifyProductImage, classifyImage };
