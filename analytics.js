import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

/**
 * analytics.js - Custom traffic tracking for AptiVerse
 */

async function trackVisit() {
    try {
        // 1. Identification
        let visitorId = localStorage.getItem('aptiverse_visitor_id');
        let isNew = false;

        if (!visitorId) {
            visitorId = 'v_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('aptiverse_visitor_id', visitorId);
            isNew = true;
        }

        // 2. Logging to Firestore
        // We log every visit (page load) to get granular data for graphs
        await addDoc(collection(db, "traffic"), {
            visitorId: visitorId,
            isNew: isNew,
            page: window.location.pathname.split('/').pop() || 'index.html',
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent
        });

        console.log(`Traffic logged: ${isNew ? 'New' : 'Returning'} visitor`);
    } catch (e) {
        // Silent fail to not disrupt user experience
        console.warn("Traffic tracking failed:", e);
    }
}

// Run on load
trackVisit();
