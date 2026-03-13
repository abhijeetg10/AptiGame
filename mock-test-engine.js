import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";

// --- CONFIGURATION ---
const TOTAL_MOCK_TIME = 24 * 60; // 24 minutes in seconds
const MODULES_COUNT = 4;
const MAX_STRIKES = 3;

const urlParams = new URLSearchParams(window.location.search);
const companyId = urlParams.get('company') || 'tcs';

// --- STATE ---
let currentState = {
    companyId: companyId,
    timeLeft: TOTAL_MOCK_TIME,
    currentModuleIndex: 0,
    sequence: [],
    cumulativeScore: 0,
    startTime: Date.now(),
    strikes: 0,
    isFinished: false,
    isPaused: false
};

const companyNames = {
    'atlas': 'Mock Test 1',
    'capgemini': 'Mock Test 2',
    'tcs': 'Mock Test 3',
    'cognizant': 'Mock Test 4'
};

const overlay = document.getElementById('proctor-overlay');
const strikeEl = document.getElementById('strike-count');
const alertTitle = document.getElementById('alert-title');
const alertMsg = document.getElementById('alert-msg');

// --- INITIALIZATION ---
function init() {
    document.getElementById('company-name').innerText = companyNames[companyId] || 'Mock Test';
    
    // 1. Persistence / Recovery
    const saved = sessionStorage.getItem('mock_test_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.companyId === companyId && !parsed.isFinished) {
            currentState = { ...currentState, ...parsed };
            console.log("Recovered state:", currentState);
        } else {
            generateSequence();
        }
    } else {
        generateSequence();
    }
    
    // Auth-aware initialization
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        if (!currentState.firestoreId && !currentState.isFinished) {
            await initTracking();
        }
    });

    // 2. Start Timer
    startTimer();
    
    // 3. Load Current Module
    loadModule(currentState.currentModuleIndex);

    // 4. Listen for signals from child iframe
    window.addEventListener('message', (event) => {
        if(event.data.type === 'MODULE_COMPLETE') {
            handleModuleComplete(event.data.score);
        }
    });

    // 5. Proctoring Setup
    setupProctoring();

    sessionStorage.setItem('mock_test_active', 'true');
    saveState();
}

function generateSequence() {
    const pool = ['motion.html', 'sudoku.html', 'inductive.html', 'grid.html', 'switch.html'];
    const randoms = [];
    while(randoms.length < 2) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if(!randoms.includes(pick)) randoms.push(pick);
    }
    currentState.sequence = ['rc.html', 'di.html', ...randoms];
    saveState();
}

function saveState() {
    sessionStorage.setItem('mock_test_state', JSON.stringify(currentState));
}

function setupProctoring() {
    // 1. Tab Switch / Window Blur
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && !currentState.isFinished) {
            handleStrike("TAB SWITCH DETECTED", "Switching tabs or minimizing the browser is strictly prohibited during the test.");
        }
    });

    window.addEventListener('blur', () => {
        if (!currentState.isFinished) {
            handleStrike("WINDOW BLURRED", "You clicked outside the test environment. Stay focused on the test window.");
        }
    });

    // 2. Console Detection (DevTools)
    const threshold = 160;
    setInterval(() => {
        if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
            handleStrike("DEV TOOLS DETECTED", "Opening developer tools is prohibited during the examination.");
        }
    }, 2000);

    // 3. Interaction Lockdown
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('copy', e => e.preventDefault());
    document.addEventListener('paste', e => e.preventDefault());
    document.addEventListener('keydown', e => {
        // Block Ctrl+C, V, U, S, P
        if (e.ctrlKey && ['c', 'v', 'u', 's', 'p'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            handleStrike("INTERACTION BLOCKED", "Copying, Pasting, and Inspecting components is disabled.");
        }
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))) {
            e.preventDefault();
            handleStrike("DEV TOOLS BLOCKED", "Developer shortcuts are disabled.");
        }
    });

    // 4. Fullscreen Enforcement
    window.addEventListener('click', () => {
        if (!document.fullscreenElement && !currentState.isFinished && !currentState.isPaused) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
        }
    }, { once: false });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && !currentState.isFinished && !currentState.isPaused) {
            handleStrike("FULLSCREEN EXITED", "Testing must be completed in Fullscreen mode.");
        }
    });
}

function handleStrike(title, reason) {
    if (currentState.isPaused || currentState.isFinished) return;
    
    currentState.strikes++;
    currentState.isPaused = true;
    saveState();

    overlay.style.display = 'flex';
    alertTitle.innerText = title;
    alertMsg.innerText = reason;
    strikeEl.innerText = `${currentState.strikes} / ${MAX_STRIKES}`;

    if (currentState.strikes >= MAX_STRIKES) {
        alertTitle.innerText = "TEST TERMINATED";
        alertMsg.innerText = "Multiple violations detected. Your test is being submitted automatically.";
        overlay.querySelector('.proctor-btn').innerText = "VIEWING SUMMARY...";
        overlay.querySelector('.proctor-btn').disabled = true;
        updateFirestoreRecord("terminated"); // Record termination
        setTimeout(() => finishTest(), 3000);
    }
}

window.resumeTest = function() {
    overlay.style.display = 'none';
    currentState.isPaused = false;
    saveState();
    
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => console.log(e));
    }
};

function startTimer() {
    const timerEl = document.getElementById('global-timer');
    const interval = setInterval(() => {
        if (currentState.isFinished) {
            clearInterval(interval);
            return;
        }

        if (!currentState.isPaused) {
            currentState.timeLeft--;
            saveState();
        }
        
        const mins = Math.floor(currentState.timeLeft / 60);
        const secs = currentState.timeLeft % 60;
        timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;

        if(currentState.timeLeft <= 0) {
            clearInterval(interval);
            timerEl.innerText = "0:00";
            handleTestTimeout();
        }
        
        if (currentState.timeLeft < 120) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
    }, 1000);
}

function loadModule(index) {
    const iframe = document.getElementById('game-frame');
    const dots = document.querySelectorAll('.indicator-dot');
    const progress = document.getElementById('progress-fill');
    
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    progress.style.width = `${(index / MODULES_COUNT) * 100}%`;
    
    iframe.src = currentState.sequence[index] + "?mode=mock";
    currentState.currentModuleIndex = index;
    saveState();
}

function handleModuleComplete(score) {
    currentState.cumulativeScore += score;
    updateFirestoreRecord("in-progress"); // Sync progress
    
    if(currentState.currentModuleIndex < MODULES_COUNT - 1) {
        loadModule(currentState.currentModuleIndex + 1);
    } else {
        finishTest();
    }
}

async function finishTest() {
    if (currentState.isFinished && currentState.isFinalSubmitted) return;
    currentState.isFinished = true;
    currentState.isFinalSubmitted = true;
    saveState();

    const progress = document.getElementById('progress-fill');
    if (progress) progress.style.width = '100%';
    
    try {
        await updateFirestoreRecord("completed");
        alert(`Test Completed!\nTotal Score: ${currentState.cumulativeScore}\nViolations: ${currentState.strikes}`);
        sessionStorage.removeItem('mock_test_active');
        sessionStorage.removeItem('mock_test_state');
        
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        
        window.location.href = 'mock-tests.html';
    } catch (e) {
        console.error("Error saving mock results:", e);
        window.location.href = 'mock-tests.html';
    }
}

// --- FIRESTORE TRACKING ---
async function initTracking() {
    const user = auth.currentUser;
    const resultData = {
        companyId: currentState.companyId,
        userName: user ? user.displayName : "Guest",
        userId: user ? user.uid : "guest",
        totalScore: 0,
        timeLeft: TOTAL_MOCK_TIME,
        strikes: 0,
        status: "in-progress",
        timestamp: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, "mock_results"), resultData);
        currentState.firestoreId = docRef.id;
        saveState();
        console.log("Tracking initialized:", currentState.firestoreId);
    } catch (e) {
        console.error("Error initializing tracking:", e);
    }
}

async function updateFirestoreRecord(status = "in-progress") {
    if (!currentState.firestoreId) return;
    
    try {
        const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        const user = auth.currentUser;
        
        const updateData = {
            companyId: currentState.companyId,
            userName: user ? user.displayName : (currentState.userName || "Guest"),
            userId: user ? user.uid : (currentState.userId || "guest"),
            totalScore: currentState.cumulativeScore,
            timeLeft: currentState.timeLeft,
            strikes: currentState.strikes,
            status: status,
            lastUpdate: serverTimestamp()
        };
        
        // Use setDoc with merge to update the existing document
        await setDoc(doc(db, "mock_results", currentState.firestoreId), updateData, { merge: true });
        console.log(`Firestore record updated (${status})`);
    } catch (e) {
        console.error("Error updating Firestore record:", e);
    }
}

// Global exposure for the abort button
window.updateMockStatus = updateFirestoreRecord;

function handleTestTimeout() {
    alert("TIME UP! Submitting your current progress.");
    finishTest();
}

// Start
init();
