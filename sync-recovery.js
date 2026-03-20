import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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
const auth = getAuth(app);

window.syncAllFromFirebase = async () => {
    if (!auth.currentUser) {
        alert("CRITICAL: You are NOT logged in to Firebase. Please refresh, wait for login to complete, and then try again. Without login, Firestore will deny access.");
        return;
    }

    if (!confirm(`RESTORE DATA FOR: ${auth.currentUser.email}?\n\nThis will pull all records from the live Firebase and overwrite local AgyDB. Continue?`)) return;

    const statusEl = document.getElementById('sync-status');
    const updateStats = (txt) => { if(statusEl) statusEl.innerText = txt; console.log(txt); };
    
    updateStats("Starting Robust Sync...");

    const collections = [
        "users", "feedback", "rating", "mock_results", 
        "activity_logs", "traffic", "system_stats"
    ];
    
    const games = ["motion", "sudoku", "inductive", "grid", "switch", "di", "rc"];
    let successCount = 0;
    let failCount = 0;

    // 1. Sync Standard Collections
    for (const col of collections) {
        try {
            updateStats(`Syncing ${col}...`);
            const snap = await getDocs(collection(db, col));
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(`agy_col_${col}`, JSON.stringify(data));
            successCount++;
        } catch (err) {
            console.error(`Failed to sync ${col}:`, err);
            failCount++;
        }
    }

    // 2. Sync Leaderboards
    for (const game of games) {
        try {
            updateStats(`Syncing Leaderboard: ${game}...`);
            const snap = await getDocs(collection(db, "leaderboards", game, "scores"));
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localStorage.setItem(`agy_col_leaderboards_${game}_scores`, JSON.stringify(data));
            successCount++;
        } catch (err) {
            console.error(`Failed to sync leaderboard ${game}:`, err);
            failCount++;
        }
    }

    // 3. System Stats Global
    try {
        updateStats(`Syncing Global Stats...`);
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        const docSnap = await getDoc(doc(db, "system_stats", "global"));
        if (docSnap.exists()) {
            localStorage.setItem(`agy_doc_system_stats_global`, JSON.stringify(docSnap.data()));
        }
        successCount++;
    } catch (err) {
        console.error(`Failed to sync global stats:`, err);
        failCount++;
    }

    if (failCount === 0) {
        updateStats("Sync SUCCESSFUL! All data restored. Reloading...");
        setTimeout(() => location.reload(), 2000);
    } else {
        updateStats(`Sync Partially Succeeded (${successCount} OK, ${failCount} FAILED). Check Console.`);
        alert(`Warning: ${failCount} collections failed to sync due to permissions. Some data may be missing.`);
    }
};

console.log("Robust Sync Utility Loaded.");
