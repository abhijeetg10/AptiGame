import { collection, addDoc, doc, setDoc, getDoc, onAuthStateChanged, db, auth, increment, signOut, serverTimestamp, updateDoc, onSnapshot } from "./db-shim.js";
import { ActivityLogger } from "./activity-logger.js";
import { initRatingSystem } from "./rating-system.js";
import { getCurrentUser } from "./auth.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";
import { getISOWeekString } from "./utils.js";

// --- Constants & Config ---
const SHAPES_POOL = ['circle', 'square', 'triangle', 'plus', 'star', 'diamond', 'pentagon', 'hexagon'];
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT } = GAME_CONFIG;

// --- Game State ---
let highestUnlockedModule = 10;
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
    if (isMock) {
        startModule(1);
    } else {
        renderModuleSelection();
    }

    // Check for Duel Mode
    if (window.roomId) {
        initDuelMode();
    }
    
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
                <p>Logic Puzzles</p>
            </div>
        `;
        if (!isLocked) {
            card.onclick = () => startModule(i);
        }
        elModuleGrid.appendChild(card);
    }
}

// Global roomId and role from URL
window.roomId = new URLSearchParams(window.location.search).get('roomId');
window.duelRole = new URLSearchParams(window.location.search).get('role');

// --- DUEL LOGIC ---
function initDuelMode() {
    console.log("Duel Mode Initialized:", window.roomId, window.duelRole);
    const vsBar = document.getElementById('duel-vs-bar');
    if (vsBar) {
        vsBar.classList.remove('hidden');
        vsBar.style.display = 'flex';
    }

    const roomRef = doc(db, "rooms", window.roomId);
    onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) {
            alert("Room closed.");
            window.location.href = "duel.html";
            return;
        }
        const data = snap.data();
        
        // Update Names/Scores
        document.getElementById('p1-duel-name').innerText = data.hostName;
        document.getElementById('p1-duel-score').innerText = data.hostScore || 0;
        document.getElementById('p2-duel-name').innerText = (data.guestName || "Waiting...") + (data.status === 'ready' ? ' (READY)' : '');
        document.getElementById('p2-duel-score').innerText = data.guestScore || 0;
    });

    // Automatically start first module if in duel
    setTimeout(() => startModule(1), 1000);
}

async function updateDuelScore() {
    if (!window.roomId) return;
    const roomRef = doc(db, "rooms", window.roomId);
    const scoreField = window.duelRole === 'host' ? 'hostScore' : 'guestScore';
    try {
        await updateDoc(roomRef, { [scoreField]: score });
    } catch (e) {
        console.error("Duel score sync failed:", e);
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
    
    elModuleDisplay.innerText = `${currentModule}`;
    
    loadLevel();
    if (!isMock) {
        updateTimerDisplay();
        startTimer();
    }
    else if (elTimer) elTimer.style.display = 'none';
};

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            endModule();
            updateTimerDisplay();
            return;
        }
        timeLeft--;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const displayTime = Math.max(0, timeLeft);
    const mins = Math.floor(displayTime / 60).toString().padStart(2, '0');
    const secs = (displayTime % 60).toString().padStart(2, '0');
    elTimer.innerText = `${mins}:${secs}`;
}

function loadLevel() {
    isGameActive = true;
    elLevel.innerText = `${currentLevel}`;
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
        updateDuelScore(); // Sync duel progress
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
        if (isCorrect) {
            currentLevel++;
        }
        loadLevel();
    }, 1200);
}

async function endModule(customTitle) {
    if (timerInterval) clearInterval(timerInterval);
    isGameActive = false;

    ActivityLogger.log('solve', 'switch');

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }

    const modal = document.getElementById('results-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    if (customTitle) document.getElementById('modal-title').innerText = customTitle;

    document.getElementById('score-text').innerText = `${correctCount}`;
    document.getElementById('correct-count').innerText = correctCount;
    document.getElementById('wrong-count').innerText = wrongCount;
    document.getElementById('final-marks').innerText = score;

    const elNextBtn = document.getElementById('next-module-btn');
    const isGameOver = currentModule >= TOTAL_MODULES || customTitle === "Time's Up!";

    if (isGameOver) {
        elNextBtn.innerText = "Finish & Exit";
        elNextBtn.onclick = () => {
            saveScoreToAgy(elNextBtn, () => {
                window.location.href = "index.html";
            });
        };
    } else {
        elNextBtn.innerText = "Start Next Module";
        elNextBtn.onclick = () => {
            saveScoreToAgy(elNextBtn, nextModule);
        };
    }

    // Add LinkedIn Share Button if not exists
    let linkedinBtn = document.getElementById('linkedin-share-btn');
    if (!linkedinBtn) {
        linkedinBtn = document.createElement('button');
        linkedinBtn.id = 'linkedin-share-btn';
        linkedinBtn.className = 'btn btn-outline';
        linkedinBtn.style.marginTop = '0.5rem';
        linkedinBtn.style.width = '100%';
        linkedinBtn.innerHTML = '<i class="fab fa-linkedin"></i> Share on LinkedIn';
        linkedinBtn.onclick = shareOnLinkedIn;
        elNextBtn.parentNode.insertBefore(linkedinBtn, elNextBtn.nextSibling);
    }

    const ratingContainer = document.getElementById('rating-section');
    if (ratingContainer) initRatingSystem(ratingContainer);
    
    // Autosave in background
    saveScoreToAgy();
}

// --- Compatibility Layer for Cached Browsers ---
window.finishModule = function(title) {
    console.warn("finishModule called (legacy). Redirecting to endModule.");
    endModule(title);
};

function nextModule() {
    currentLevel = 1;
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    timeLeft = MODULE_TIME_LIMIT;
    
    document.getElementById('results-modal').classList.add('hidden');
    document.getElementById('results-modal').style.display = 'none';
    
    startModule(currentModule);
}

async function saveScoreToAgy(btnElement = null, redirectCallback = null) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerText = "Saving...";
    }

    try {
        const user = await getCurrentUser();
        if (user) {
            const scoreRef = doc(db, "leaderboards", "switch", "scores", user.uid);
            const scoreSnap = await getDoc(scoreRef);
            
            let existingModuleScores = {};
            let cumulativeCorrect = 0;
            if (scoreSnap.exists()) {
                const oldData = scoreSnap.data();
                if (oldData.moduleScores) {
                    existingModuleScores = oldData.moduleScores;
                }
                if (oldData.metrics && oldData.metrics.correctCount) {
                    cumulativeCorrect = oldData.metrics.correctCount;
                }
            }

            // Only add the new module's correct count if it's the first time or a better score
            if (existingModuleScores[currentModule] === undefined || score > existingModuleScores[currentModule]) {
                // If we are improving the score for this module, we need to adjust cumulativeCorrect
                const previousBestCorrect = existingModuleScores[currentModule] ? Math.floor(existingModuleScores[currentModule] / 3) : 0;
                cumulativeCorrect = (cumulativeCorrect - previousBestCorrect) + correctCount;
                existingModuleScores[currentModule] = score;
            }

            let totalScore = 0;
            // Removed Levels_Per_Module calculation for infinite play
            for (const mod in existingModuleScores) {
                totalScore += existingModuleScores[mod];
            }

            const payload = {
                name: user.displayName || "Anonymous Player",
                score: totalScore,
                moduleScores: existingModuleScores,
                metrics: {
                    correctCount: cumulativeCorrect,
                    totalMarks: totalScore,
                    lastModuleMarks: score,
                    timeSpent: MODULE_TIME_LIMIT - timeLeft
                },
                timestamp: new Date()
            };

            await setDoc(scoreRef, payload, { merge: true });

            // 1. Progression & Denormalization
            const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1);
            await setDoc(doc(db, "users", user.uid), {
                [`highestModule_switch`]: moduleReached,
                totalScore: increment(score),
                modulesCompleted: increment(1),
                [`gameScores.${isMock ? 'mock_' : ''}switch`]: increment(score),
                lastPlayed: new Date()
            }, { merge: true });
            
            // 2. WEEKLY LEADERBOARD (New)
            try {
                const weekId = getISOWeekString();
                const weeklyRef = doc(db, "weekly_leaderboards", weekId, "scores", user.uid);
                await setDoc(weeklyRef, {
                    name: user.displayName || "Anonymous Player",
                    score: increment(score),
                    timestamp: serverTimestamp()
                }, { merge: true });
            } catch (weeklyError) {
                console.warn("Weekly leaderboard save failed:", weeklyError);
            }

            // 3. COLLEGE LEADERBOARD (New)
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists() && userSnap.data().college) {
                    const collegeName = userSnap.data().college;
                    const collegeId = collegeName.toLowerCase().trim().replace(/\s+/g, '_');
                    const collRef = doc(db, "colleges_leaderboard", collegeId);
                    await setDoc(collRef, {
                        displayName: collegeName,
                        totalScore: increment(score),
                        timestamp: serverTimestamp()
                    }, { merge: true });

                    // Also update individual score entry
                    await setDoc(scoreRef, { college: collegeName }, { merge: true });
                }
            } catch (collError) {
                console.warn("College leaderboard update failed:", collError);
            }

            if (btnElement) {
                btnElement.innerText = "Progress Saved!";
                btnElement.style.backgroundColor = "#10b981";
            }
        } else {
            // Guest Fallback (Standard Collection)
            await addDoc(collection(db, "leaderboards", "switch", "scores"), {
                name: "Guest Player",
                score: score,
                totalLevels: LEVELS_PER_MODULE,
                metrics: {
                    correctCount: correctCount,
                    totalMarks: score,
                    timeSpent: MODULE_TIME_LIMIT - timeLeft
                },
                timestamp: new Date()
            });
            if (btnElement) btnElement.innerText = "Score Saved!";
        }
    } catch (error) {
        console.error("Save failed:", error);
        if (btnElement) {
            btnElement.innerText = "Save Failed";
            btnElement.disabled = false;
        }
    }

    if (redirectCallback) {
        setTimeout(redirectCallback, 1000);
    }
}

function shareOnLinkedIn() {
    const text = `I just completed Switch Challenge Module ${currentModule} on AptiVerse with ${correctCount}/${LEVELS_PER_MODULE} correct! 🚀 #AptitudeReasoning #AptiVerse`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'width=600,height=400');
}

document.getElementById('next-module-btn').onclick = () => {
    // This is handled dynamically in endModule now
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
            if (userDoc.exists()) {
                    highestUnlockedModule = 10; // Forced unlock
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
