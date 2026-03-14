import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";
import { db, analytics } from "./firebase-config.js";

/**
 * analytics.js - Custom traffic tracking for AptiVerse
 */

async function trackVisit() {
    try {
        // 1. Official Firebase Analytics SDK logging
        logEvent(analytics, 'page_view', {
            page_title: document.title,
            page_location: window.location.href,
            page_path: window.location.pathname
        });

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

        console.log(`Traffic logged to official SDK and Firestore: ${isNew ? 'New' : 'Returning'} visitor`);
    } catch (e) {
        // Silent fail to not disrupt user experience
        console.warn("Traffic tracking failed:", e);
    }
}

// Run on load
trackVisit();
