import { collection, addDoc, serverTimestamp, db } from "./db-shim.js";
// Mocked analytics for AgyDB
export const getAnalytics = () => ({});
export const logEvent = () => {};

/**
 * analytics.js - Custom traffic tracking for AptiVerse
 */

async function trackVisit() {
    try {
        /* Local AgyDB Tracking Only */

        // 2. Identification (Custom Firestore Tracking)
        let visitorId = localStorage.getItem('aptiverse_visitor_id');
        let isNew = false;

        if (!visitorId) {
            visitorId = 'v_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('aptiverse_visitor_id', visitorId);
            isNew = true;
        }

        // 3. Logging to Firestore (For the Admin Dashboard)
        // We log every visit (page load) to get granular data for graphs
        await addDoc(collection(db, "traffic"), {
            visitorId: visitorId,
            isNew: isNew,
            page: window.location.pathname.split('/').pop() || 'index.html',
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent
        });

        console.log(`Traffic logged to AgyDB: ${isNew ? 'New' : 'Returning'} visitor`);
    } catch (e) {
        // Silent fail to not disrupt user experience
        console.warn("Traffic tracking failed:", e);
    }
}

// Run on load
trackVisit();
