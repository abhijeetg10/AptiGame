import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAeEyap9MQ3eINdVhY3GGhdideIaSQ7M_Q",
    authDomain: "aptigame.firebaseapp.com",
    projectId: "aptigame",
    storageBucket: "aptigame.firebasestorage.app",
    messagingSenderId: "201198068351",
    appId: "1:201198068351:web:13a0b2c6aaacc21632154a",
    measurementId: "G-C9PZ77HM98"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.syncAllFromFirebase = async () => {
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
    const auth = getAuth(app);
    
    if (!auth.currentUser) {
        alert("You must be logged in to restore data. Please refresh and login again.");
        return;
    }

    if (!confirm(`Restore data for ${auth.currentUser.email}? This will pull all data from Firebase and overwrite local AgyDB.`)) return;

    const statusEl = document.getElementById('sync-status') || { set innerText(v) { console.log(v); } };
    statusEl.innerText = "Starting Sync... Please wait.";

    const collections = [
        "users", "feedback", "rating", "mock_results", 
        "activity_logs", "traffic", "system_stats"
    ];
    
    const games = ["motion", "sudoku", "inductive", "grid", "switch", "di", "rc"];

    try {
        // 1. Sync Standard Collections
        for (const col of collections) {
            statusEl.innerText = `Syncing ${col}...`;
            const snap = await getDocs(collection(db, col));
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(`agy_col_${col}`, JSON.stringify(data));
        }

        // 2. Sync Leaderboards (Hierarchical)
        for (const game of games) {
            statusEl.innerText = `Syncing Leaderboard: ${game}...`;
            const snap = await getDocs(collection(db, "leaderboards", game, "scores"));
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(`agy_col_leaderboards_${game}_scores`, JSON.stringify(data));
        }

        // 3. Special Case: System Stats Global Doc
        statusEl.innerText = `Syncing System Stats...`;
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        const docSnap = await getDoc(doc(db, "system_stats", "global"));
        if (docSnap.exists()) {
            localStorage.setItem(`agy_doc_system_stats_global`, JSON.stringify(docSnap.data()));
        }

        statusEl.innerText = "Sync SUCCESSFUL! All data restored. The page will reload now.";
        setTimeout(() => location.reload(), 2000);

    } catch (err) {
        console.error("Sync failed:", err);
        statusEl.innerText = `Sync FAILED: ${err.message}`;
        alert("Sync failed. Check console for details.");
    }
};

console.log("Direct Sync Utility Loaded. Call 'await syncAllFromFirebase()' to start.");
