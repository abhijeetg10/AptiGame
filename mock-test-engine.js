import { collection, addDoc, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
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

// Instruction Overlays
const onboardingOverlay = document.getElementById('onboarding-overlay');
const moduleOverlay = document.getElementById('module-overlay');
const moduleIndicator = document.getElementById('module-indicator');
const moduleTitle = document.getElementById('module-title');
const moduleDesc = document.getElementById('module-desc');
const moduleExample = document.getElementById('module-example');
const moduleTip = document.getElementById('module-tip');
const startAssessmentBtn = document.getElementById('start-assessment-btn');
const beginModuleBtn = document.getElementById('begin-module-btn');

const GAME_INFO = {
    'motion.html': {
        title: "Motion Tracking",
        desc: "Observe the moving objects and predict their trajectories. This module tests your visual spatial awareness and reaction time.",
        tip: "Keep your eyes on the primary target; peripheral motion is often a distraction.",
        example: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop"
    },
    'sudoku.html': {
        title: "Sudoku Logic",
        desc: "Fill the grid such that every row, column, and subgrid contains unique values. Accuracy is critical in this logical reasoning task.",
        tip: "Start with the sections that have the most pre-filled numbers.",
        example: "https://images.unsplash.com/photo-1543269664-76ec3997d9ea?q=80&w=800&auto=format&fit=crop"
    },
    'inductive.html': {
        title: "Inductive Reasoning",
        desc: "Identify the pattern in the sequence of shapes and choose the next logical figure. Focus on rotations and color changes.",
        tip: "Analyze one element (like shape or color) at a time to find the underlying rule.",
        example: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800&auto=format&fit=crop"
    },
    'grid.html': {
        title: "Grid Memory",
        desc: "Remember the highlighted cells in the grid and recall them after they disappear. Tests short-term visual memory.",
        tip: "Try to group cells into shapes (like L-shapes or squares) to remember them easier.",
        example: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?q=80&w=800&auto=format&fit=crop"
    },
    'switch.html': {
        title: "Switch Challenge",
        desc: "Toggle the switches to route the current through the bridge. Requires fast logical switching and problem solving.",
        tip: "Follow the path from the end-point backwards to see which switches are needed.",
        example: "https://images.unsplash.com/photo-1555664424-6cc5c2826cf9?q=80&w=800&auto=format&fit=crop"
    },
    'rc.html': {
        title: "Reading Comprehension",
        desc: "Read the provided passages and answer the questions. This module evaluates your analytical reading and synthesis skins.",
        tip: "Read the questions first to know what specific details to look for in the text.",
        example: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=800&auto=format&fit=crop"
    },
    'di.html': {
        title: "Data Interpretation",
        desc: "Analyze charts and graphs to answer specific data-driven questions. Tests quantitative reasoning and data synthesis.",
        tip: "Check the units and axis labels carefully before performing any calculations.",
        example: "https://images.unsplash.com/photo-1551288049-bbda38a594a0?q=80&w=800&auto=format&fit=crop"
    }
};

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
            
            // If we recovered, don't show onboarding, but we might need instructions for current module
            onboardingOverlay.style.display = 'none';
            if (currentState.currentModuleIndex > 0 || currentState.isStarted) {
                resumeAfterRecovery();
            }
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

    // 2. Setup Listeners
    setupListeners();

    // 3. Proctoring Setup (Disabled as requested)
    // setupProctoring();

    // 4. Initial Sidebar Render
    renderSidebar();

    sessionStorage.setItem('mock_test_active', 'true');
    saveState();
}

function setupListeners() {
    // Start Assessment
    startAssessmentBtn.onclick = async () => {
        try {
            await document.documentElement.requestFullscreen();
        } catch (e) {
            console.warn("Fullscreen request failed:", e);
        }
        
        onboardingOverlay.style.display = 'none';
        currentState.isStarted = true;
        saveState();
        
        startTimer();
        showModuleInstructions(0);
    };

    // Begin Specific Module
    beginModuleBtn.onclick = () => {
        moduleOverlay.style.display = 'none';
        currentState.isPaused = false;
        saveState();
        
        loadModule(currentState.currentModuleIndex);
    };

    // SKIP SECTION Logic
    const skipBtn = document.getElementById('skip-section-btn');
    if (skipBtn) {
        skipBtn.onclick = () => {
            if (currentState.isPaused) return; // Don't skip during instructions
            if (confirm("Skip this section? You will receive 0 marks for this module, but it will let you continue the test.")) {
                handleModuleComplete(0);
                renderSidebar();
            }
        };
    }

    // Listen for signals from child iframe
    window.addEventListener('message', (event) => {
        if(event.data.type === 'MODULE_COMPLETE') {
            handleModuleComplete(event.data.score);
            renderSidebar(); // Update sidebar on completion
        }
    });
}

function resumeAfterRecovery() {
    startTimer();
    loadModule(currentState.currentModuleIndex);
}

function generateSequence() {
    const presets = {
        'atlas': ['motion.html', 'switch.html', 'rc.html', 'di.html'],
        'capgemini': ['sudoku.html', 'grid.html', 'rc.html', 'di.html'],
        'tcs': ['motion.html', 'sudoku.html', 'rc.html', 'di.html'],
        'cognizant': ['inductive.html', 'grid.html', 'rc.html', 'di.html']
    };

    currentState.sequence = presets[companyId] || ['rc.html', 'di.html', 'motion.html', 'sudoku.html'];
    currentState.currentModuleIndex = 0;
    saveState();
}

function saveState() {
    sessionStorage.setItem('mock_test_state', JSON.stringify(currentState));
}

function setupProctoring() {
    // Disabled as requested
}

function handleStrike(title, reason) {
    // Disabled as requested
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
    
    if (progress) progress.style.width = `${(index / MODULES_COUNT) * 100}%`;
    
    iframe.src = currentState.sequence[index] + "?mode=mock";
    currentState.currentModuleIndex = index;
    saveState();
}

function showModuleInstructions(index) {
    const moduleFile = currentState.sequence[index];
    const info = GAME_INFO[moduleFile] || { title: "Next Module", desc: "Complete the next section of the assessment.", tip: "Keep going!", example: "" };

    currentState.isPaused = true;
    currentState.currentModuleIndex = index;
    saveState();

    moduleIndicator.innerText = `MODULE ${index + 1} OF ${MODULES_COUNT}`;
    moduleTitle.innerText = info.title;
    moduleDesc.innerText = info.desc;
    moduleTip.innerText = info.tip;
    moduleExample.src = info.example || "";
    moduleExample.style.display = info.example ? "block" : "none";

    moduleOverlay.style.display = 'flex';
}

function handleModuleComplete(score) {
    currentState.cumulativeScore += score;
    updateFirestoreRecord("in-progress"); // Sync progress
    
    if(currentState.currentModuleIndex < MODULES_COUNT - 1) {
        showModuleInstructions(currentState.currentModuleIndex + 1);
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
        
        // INCREMENT GLOBAL MOCK TEST COUNT
        await setDoc(doc(db, "system_stats", "global"), { totalMockTests: increment(1) }, { merge: true });
        
        saveState();
        console.log("Tracking initialized:", currentState.firestoreId);
    } catch (e) {
        console.error("Error initializing tracking:", e);
    }
}

async function updateFirestoreRecord(status = "in-progress") {
    if (!currentState.firestoreId) return;
    
    try {
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

// --- SIDEBAR RENDERING ---
function renderSidebar() {
    const list = document.getElementById('mock-sidebar-list');
    if (!list) return;
    
    list.innerHTML = "";
    currentState.sequence.forEach((module, index) => {
        const info = GAME_INFO[module] || { title: module };
        const item = document.createElement('div');
        item.className = `sidebar-item ${index === currentState.currentModuleIndex ? 'active-step' : ''}`;
        
        let statusClass = "";
        let statusText = "Upcoming";
        
        if (index < currentState.currentModuleIndex) {
            statusClass = "done";
            statusText = "Completed";
        } else if (index === currentState.currentModuleIndex) {
            statusClass = "active";
            statusText = "In Progress";
        }
        
        item.innerHTML = `
            <div class="status-dot ${statusClass}"></div>
            <div class="item-info">
                <span class="item-name">${info.title}</span>
                <span class="item-status">${statusText}</span>
            </div>
        `;
        list.appendChild(item);
    });
}

// Start
init();
