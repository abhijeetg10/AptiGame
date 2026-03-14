import { db, auth } from "./firebase-config.js";
import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getCurrentUser } from "./auth.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";

// --- Constants & Config ---
const SHAPES_POOL = ['circle', 'square', 'triangle', 'plus', 'star', 'diamond', 'pentagon', 'hexagon'];
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT } = GAME_CONFIG;

// --- Game State ---
let highestUnlockedModule = 5;
let currentModule = 1;
let currentLevel = 1;
let score = 0;
let correctCount = 0;
let wrongCount = 0;
let timeLeft = MODULE_TIME_LIMIT;
let timerInterval = null;
let isGameActive = false;
let currentSolution = "";
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';

// --- DOM Elements ---
const elTimer = document.getElementById('timer-display');
const elLevel = document.getElementById('level-display');
const elModuleDisplay = document.getElementById('module-display');
const elScore = document.getElementById('score-display');
const elGameHeader = document.getElementById('game-header');
const elGameContainer = document.getElementById('game-container');
const elModuleSelection = document.getElementById('module-selection');
const elModuleGrid = document.getElementById('module-grid');
const elInputShapes = document.getElementById('input-shapes');
const elOutputShapes = document.getElementById('output-shapes');
const elAnswerPanel = document.getElementById('answer-panel');
const elFeedbackStatus = document.getElementById('feedback-status');
const elFeedbackPoints = document.getElementById('feedback-points');

// --- Initialization ---
function init() {
    renderModuleSelection();
    
    document.getElementById('back-to-modules-btn').onclick = (e) => {
        e.preventDefault();
        if (isMock) {
            if (confirm("Abort Mock Test?")) window.parent.location.href = 'mock-tests.html';
        } else {
            location.reload();
        }
    };
}

function renderModuleSelection() {
    elModuleGrid.innerHTML = "";
    const colors = [
        ['#3b82f6', '#60a5fa'], // blue
        ['#10b981', '#34d399'], // green
        ['#f59e0b', '#fbbf24'], // orange
        ['#8b5cf6', '#a78bfa'], // purple
        ['#ef4444', '#f87171']  // red
    ];

    for (let i = 1; i <= TOTAL_MODULES; i++) {
        const [c1, c2] = colors[(i - 1) % colors.length];
        const card = document.createElement('div');
        card.className = 'card module-card';
        
        const isLocked = i > highestUnlockedModule && !isMock; // Unlock all for normal play
        card.style.cursor = "pointer";
        card.style.opacity = "1";
        card.title = "Click to play";

        card.style.textAlign = 'left';
        card.innerHTML = `
            <div class="card-img" style="height: 140px; background: linear-gradient(135deg, ${c1}, ${c2}); display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 4rem; font-weight: 800; color: white; opacity: 0.9;">${i}</span>
            </div>
            <div class="card-content">
                <h3>Set ${i}</h3>
                <p>18 Logic Puzzles</p>
            </div>
        `;
        if (!isLocked) {
            card.onclick = () => startModule(i);
        }
        elModuleGrid.appendChild(card);
    }
}

window.startModule = function (moduleNum) {
    currentModule = moduleNum;
    currentLevel = 1;
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    timeLeft = MODULE_TIME_LIMIT;
    
    elModuleSelection.classList.add('hidden');
    elGameHeader.classList.remove('hidden');
    elGameContainer.classList.remove('hidden');
    
    elModuleDisplay.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    
    loadLevel();
    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
};

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const secs = (timeLeft % 60).toString().padStart(2, '0');
        elTimer.innerText = `${mins}:${secs}`;
        
        if (timeLeft <= 0) {
            finishModule();
        }
    }, 1000);
}

function loadLevel() {
    if (currentLevel > LEVELS_PER_MODULE) {
        finishModule();
        return;
    }

    isGameActive = true;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elScore.innerText = score;

    generateLevel();
}

function generateLevel() {
    // Determine shape count based on module
    let shapeCount = 4;
    if (currentModule === 2) shapeCount = 5;
    if (currentModule === 3) shapeCount = 6;
    if (currentModule >= 4) shapeCount = 8;

    const shapes = [...SHAPES_POOL].slice(0, shapeCount);
    const inputShapes = [...shapes].sort(() => Math.random() - 0.5);
    
    // Create base sequence [1, 2, 3... N]
    const baseSeq = Array.from({length: shapeCount}, (_, i) => i + 1);
    
    // For Module 5, we do 2 switches
    let finalPermutation = [...baseSeq].sort(() => Math.random() - 0.5);
    
    if (currentModule === 5) {
        // Multi-stage logic (visualized as two nodes in UI)
        const perm1 = [...baseSeq].sort(() => Math.random() - 0.5);
        const perm2 = [...baseSeq].sort(() => Math.random() - 0.5);
        
        // Final transformation is the composition: result[i] = input[perm2[perm1[i]-1]-1]
        // Wait, simpler: intermediate = input[perm1], output = intermediate[perm2]
        finalPermutation = perm1.map(pos => perm2[pos - 1]);
        
        displayMultiStage(perm1, perm2);
    } else {
        clearMultiStage();
        finalPermutation = [...baseSeq].sort(() => Math.random() - 0.5);
    }

    currentSolution = finalPermutation.join("");

    const outputShapes = [];
    finalPermutation.forEach(pos => {
        outputShapes.push(inputShapes[pos - 1]);
    });

    const options = [currentSolution];
    while (options.length < 4) {
        const decoy = [...baseSeq].sort(() => Math.random() - 0.5).join("");
        if (!options.includes(decoy)) options.push(decoy);
    }
    options.sort(() => Math.random() - 0.5);

    renderShapes(elInputShapes, inputShapes);
    renderShapes(elOutputShapes, outputShapes);
    renderOptions(options);

    // Dynamic sizing for 8 shapes
    if (shapeCount > 6) {
        elInputShapes.classList.add('dense');
        elOutputShapes.classList.add('dense');
    } else {
        elInputShapes.classList.remove('dense');
        elOutputShapes.classList.remove('dense');
    }
}

function displayMultiStage(p1, p2) {
    const parent = document.querySelector('.permutation-zone');
    let multi = document.getElementById('multi-stage-indicator');
    if (!multi) {
        multi = document.createElement('div');
        multi.id = 'multi-stage-indicator';
        multi.className = 'multi-stage-visual';
        parent.prepend(multi);
    }
    multi.innerHTML = `
        <div class="stage-node">${p1.join("")}</div>
        <div class="stage-arrow">↓</div>
        <div class="stage-node highlight">?</div>
    `;
    document.querySelector('.giant-arrow-refined').style.opacity = '0.2';
}

function clearMultiStage() {
    const multi = document.getElementById('multi-stage-indicator');
    if (multi) multi.remove();
    document.querySelector('.giant-arrow-refined').style.opacity = '0.6';
}

function renderShapes(container, shapes) {
    container.innerHTML = "";
    shapes.forEach(type => {
        const div = document.createElement('div');
        div.className = `shape ${type}`;
        container.appendChild(div);
    });
}

function renderOptions(options) {
    elAnswerPanel.innerHTML = "";
    options.forEach(code => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn-themed';
        if (code.length > 6) btn.classList.add('small-text');
        btn.innerText = code;
        btn.onclick = () => handleAnswer(code);
        elAnswerPanel.appendChild(btn);
    });
}

function handleAnswer(selectedCode) {
    if (!isGameActive) return;
    isGameActive = false;

    const isCorrect = selectedCode === currentSolution;
    if (isCorrect) {
        score += 3;
        correctCount++;
        showFeedback(true, currentSolution);
    } else {
        // No negative mark
        wrongCount++;
        showFeedback(false, currentSolution);
    }
}

function showFeedback(isCorrect, solution = "") {
    const el = document.getElementById('feedback-popup');
    el.classList.remove('hidden');
    
    if (isCorrect) {
        elFeedbackStatus.innerText = 'CORRECT';
        el.style.color = '#10b981';
        elFeedbackPoints.innerText = '+3 MARKS';
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else {
        elFeedbackStatus.innerHTML = `WRONG<br><span style="font-size: 0.9rem; opacity: 0.8; font-weight: 500;">Correct: ${solution}</span>`;
        el.style.color = '#ef4444';
        elFeedbackPoints.innerText = '';
    }
    
    setTimeout(() => {
        el.classList.add('hidden');
        currentLevel++;
        loadLevel();
    }, 1200);
}

async function endModule() {
    clearInterval(timerInterval);
    isGameActive = false;
    
    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }

    const modal = document.getElementById('results-modal');
    const ratingContainer = document.getElementById('rating-section');
    if (ratingContainer) initRatingSystem(ratingContainer);

    modal.classList.remove('hidden');
    
    document.getElementById('score-text').innerText = `${correctCount} / ${LEVELS_PER_MODULE}`;
    document.getElementById('final-marks').innerText = score;
    document.getElementById('accuracy-text').innerText = `${Math.round((correctCount/LEVELS_PER_MODULE)*100)}%`;
    
    const user = await getCurrentUser();
    if (user) {
        try {
            // 1. PRIORITIZE PROGRESSION
            try {
                const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1);
                if (moduleReached > highestUnlockedModule) {
                    highestUnlockedModule = moduleReached;
                    await setDoc(doc(db, "users", user.uid), {
                        highestModule_switch: moduleReached
                    }, { merge: true });
                    console.log("Switch progression saved.");
                }
            } catch (progError) {
                console.error("Switch progression save failed:", progError);
            }

            // 2. ATTEMPT LEADERBOARD (Non-blocking)
            try {
                const scoreRef = doc(db, "leaderboards", "switch", "scores", user.uid);
                const scoreSnap = await getDoc(scoreRef);
                
                let existingModuleScores = {};
                if (scoreSnap.exists()) {
                    const oldData = scoreSnap.data();
                    if (oldData.moduleScores) {
                        existingModuleScores = oldData.moduleScores;
                    } else if (typeof oldData.score === "number") {
                        existingModuleScores["1"] = oldData.score; // Migration
                    }
                }

                if (existingModuleScores[currentModule] === undefined || score > existingModuleScores[currentModule]) {
                    existingModuleScores[currentModule] = score;
                }

                let totalScore = 0;
                let totalPossible = 0;
                for (const mod in existingModuleScores) {
                    totalScore += existingModuleScores[mod];
                    totalPossible += LEVELS_PER_MODULE; 
                }

                await setDoc(scoreRef, {
                    name: user.displayName || "Guest Player",
                    score: totalScore,
                    totalLevels: totalPossible,
                    moduleScores: existingModuleScores,
                    metrics: {
                        correctCount: correctCount,
                        totalMarks: score,
                        timeSpent: MODULE_TIME_LIMIT - timeLeft
                    },
                    timestamp: new Date()
                }, { merge: true });
                console.log("Switch leaderboard updated.");
            } catch (lbError) {
                console.warn("Switch leaderboard save failed (Permissions?):", lbError);
            }

        } catch (e) {
            Logger.handleFirestoreError("saveScore_switch", e);
        }
    }

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
    }
}

document.getElementById('next-module-btn').onclick = () => {
    location.reload();
};

const btnLogout = document.getElementById("nav-logout-btn");
if(btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        window.location.reload();
    });
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        // Load User Progress
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists() && userDoc.data().highestModule_switch) {
                highestUnlockedModule = userDoc.data().highestModule_switch;
            }
        } catch (e) { console.error(e); }
        if (!isMock) init();
    }
});

const isMockLocal = new URLSearchParams(window.location.search).get('mode') === 'mock';
if (isMockLocal) {
    // Auto-start first module in mock mode
    setTimeout(() => {
        const sel = document.getElementById('module-selection');
        if (sel) sel.classList.add('hidden');
        startModule(1);
    }, 500);
}
