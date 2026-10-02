/**
 * ServiCell API Module
 * Routes all requests through the Supabase layer (js/supabase.js).
 *
 * The public interface is IDENTICAL to the old GAS version —
 * all existing callers work without modification.
 *
 * ⚠️ IMPORTANT: Set SUPABASE_URL and SUPABASE_ANON in js/supabase.js
 *    before going live.
 */

// Legacy timeout constant kept for any code that references it
const API_TIMEOUT = 15000;

// Kept for any code that still references SCRIPT_URL (logs, etc.)
const SCRIPT_URL = '[migrated to Supabase — see js/supabase.js]';

/**
 * GET-style read operations.
 * Accepts the same { action, ...params } object as before.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 *
 * @example
 * const { jobs } = await apiGet({ action: 'list' });
 */
async function apiGet(params) {
    const { action, id, repairId, orderNumber, ...rest } = params;
    const resolvedId = id || repairId || orderNumber;
    try {
        return await handleAction(
            (action || '').toLowerCase().trim(),
            resolvedId,
            { ...params }
        );
    } catch (error) {
        console.error('[API] GET error:', error.message, params);
        throw error;
    }
}

/**
 * POST-style write operations.
 * Accepts either a plain object or URLSearchParams.
 *
 * @param {Object|URLSearchParams} params
 * @returns {Promise<Object>}
 *
 * @example
 * await apiPost({ action: 'create', customerName: 'John', device: 'iPhone' });
 */
async function apiPost(params) {
    // Normalize URLSearchParams → plain object
    if (params instanceof URLSearchParams) {
        const obj = {};
        params.forEach((v, k) => { obj[k] = v; });
        params = obj;
    }

    const { action, id, repairId, orderNumber, ...rest } = params;
    const resolvedId = id || repairId || orderNumber;
    try {
        return await handleAction(
            (action || '').toLowerCase().trim(),
            resolvedId,
            { ...params }
        );
    } catch (error) {
        console.error('[API] POST error:', error.message, params);
        throw error;
    }
}

/**
 * Fire-and-forget POST — non-critical background operations.
 * Errors are logged but not thrown.
 *
 * @param {Object|URLSearchParams} params
 */
function apiPostAsync(params) {
    apiPost(params).catch(error => {
        console.warn('[API] Async POST failed:', error.message, params);
    });
}

/**
 * Image upload — still routed through the Cloudflare Worker / Drive.
 * Kept for backwards compatibility.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function apiUpload(params) {
    if (!(params instanceof URLSearchParams)) {
        params = new URLSearchParams(params);
    }
    try {
        const response = await fetch(
            'https://servicell-push.ericsonchee33.workers.dev/upload',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            }
        );
        if (!response.ok) throw new Error(`Upload HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('[API] Upload failed:', error);
        throw error;
    }
}

/** Upload with exponential backoff — used for inspection photos. */
async function apiUploadWithRetry(params, maxRetries = 3) {
    return apiRetry(apiUpload, params, maxRetries);
}

/** Compress a data-URL image for upload (shared by new-job + current-jobs). */
function compressDataUrl(dataUrl, maxPx, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('Image compression timed out')), 30000);
        img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Invalid image data'));
        };
        img.onload = () => {
            clearTimeout(timer);
            let w = img.width, h = img.height;
            if (w > maxPx || h > maxPx) {
                if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
                else       { w = Math.round(w * maxPx / h); h = maxPx; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    });
}

const INSPECTION_PHOTO_STAGES = ['front', 'back', 'accessories'];

/**
 * Upload one inspection photo. The server stores it and attaches it to the job in one step,
 * and records who uploaded it.
 * @returns {Promise<string>} Public object URL
 */
async function uploadAndAttachJobImage(repairId, dataUrl, imageIndex, estimateOnly) {
    const compressed = await compressDataUrl(dataUrl, 1200, 0.8);
    const stage = INSPECTION_PHOTO_STAGES[imageIndex - 1] || `additional-${imageIndex}`;
    let lastError = 'Photo upload failed';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await apiPost({
                action: 'uploadphoto',
                repairId,
                stage,
                image: compressed,
                estimateOnly: estimateOnly ? '1' : undefined,
            });
            if (res && res.success !== false && res.url) return res.url;
            lastError = (res && res.error) || lastError;
            if (res && (res.forbidden || res.signedOut)) break;
        } catch (error) {
            lastError = error.message || lastError;
        }
        console.warn(`[API] Photo upload attempt ${attempt}/3 failed:`, lastError);
        if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
        }
    }
    throw new Error(lastError);
}

/**
 * Retry wrapper — unchanged from the original.
 *
 * @param {Function} apiFunction
 * @param {Object}   params
 * @param {number}   maxRetries
 * @returns {Promise<Object>}
 */
async function apiRetry(apiFunction, params, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiFunction(params);
        } catch (error) {
            lastError = error;
            console.warn(`[API] Attempt ${attempt}/${maxRetries} failed:`, error.message);
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

// ES6 module export (Node / bundlers)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiGet, apiPost, apiPostAsync, apiUpload, apiUploadWithRetry,
        apiRetry, compressDataUrl, uploadAndAttachJobImage, SCRIPT_URL
    };
}

console.log('[API] ServiCell API module loaded — powered by Supabase.');
