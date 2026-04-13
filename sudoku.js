import { collection, addDoc, doc, setDoc, getDoc, updateDoc, onAuthStateChanged, db, auth, increment, serverTimestamp, onSnapshot } from "./db-shim.js";
import { getISOWeekString } from "./utils.js";
import { initRatingSystem } from "./rating-system.js";
import { ActivityLogger } from "./activity-logger.js";
import { getCurrentUser } from "./auth.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";

// --- Auth Guard ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        alert("Authentication required. Redirecting to home page...");
        window.location.href = "index.html";
    }
});

// --- Constants & Config ---
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT } = GAME_CONFIG;

let highestUnlockedModule = 10;
let currentModule = 1;
let currentLevel = 1;
let score = 0;
let totalPossible = 0;
let correctAnswers = 0;
let wrongAnswers = 0;
let totalTimeSpent = 0;
let timeRemaining = MODULE_TIME_LIMIT;
let timerInterval;
let moduleScores = [];
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';

// --- Sound Effects ---
const sounds = {
    correct: new Audio('assets/sounds/correct.mp3'),
    wrong: new Audio('assets/sounds/wrong.mp3'),
    complete: new Audio('assets/sounds/complete.mp3')
};

let gridDimensions = 3; // Starts at 3x3
let targetAnswer = "";
let shapesPool = ["shape-square", "shape-circle", "shape-triangle", "shape-star", "shape-diamond", "shape-cross", "shape-pentagon", "shape-hexagon"];

// --- DOM Elements ---
const elModuleSelection = document.getElementById("module-selection");
const elGameHeader = document.getElementById("game-header");
const elGameContainer = document.getElementById("game-container");
const moduleBtns = document.querySelectorAll(".module-card");
const elBackToModulesBtn = document.getElementById("back-to-modules-btn");

const elModule = document.getElementById("module-display");
const elLevel = document.getElementById("level-display");
const elTimer = document.getElementById("timer-display");
const elScore = document.getElementById("score-display");
const elGrid = document.getElementById("sudoku-grid");
const elOptions = document.getElementById("options-container");

const elModal = document.getElementById("results-modal");
const elModalTitle = document.getElementById("modal-title");
const elScoreText = document.getElementById("score-text");
const elCorrectCount = document.getElementById("correct-count");
const elWrongCount = document.getElementById("wrong-count");
const elNextBtn = document.getElementById("next-module-btn");

// --- Initialization & Event Listeners ---
moduleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        let selectedModule = parseInt(btn.getAttribute("data-module"));
        startModule(selectedModule);
    });
});

if (elBackToModulesBtn) {
    elBackToModulesBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showModuleSelection();
    });
}

// Fetch user progress on initial load
async function loadUserProgress() {
    highestUnlockedModule = 10; // Default to unlocked
    const activeUser = getCurrentUser();
    if (activeUser) {
        try {
            const userDocRef = doc(db, "users", activeUser.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                // highestUnlockedModule = data.highestUnlockedModule || 1; // Uncomment for true progression
            }
        } catch (e) {
            console.error("Error loading user progress:", e);
        }
    }

    // Check for Duel Mode
    if (window.roomId) {
        initDuelMode();
    }
    
    if (isMock) {
        startModule(1);
        if (elModuleSelection) elModuleSelection.style.display = 'none';
        if (elGameContainer) elGameContainer.classList.remove('hidden');
    } else {
        // Update UI locks
        moduleBtns.forEach(btn => {
            const modNum = parseInt(btn.getAttribute("data-module"));
            if (modNum <= highestUnlockedModule) {
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
                btn.title = "Click to play";
            } else {
                btn.style.opacity = "0.5";
                btn.style.pointerEvents = "none";
                btn.title = "Complete previous modules to unlock";
            }
        });
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

// Ensure game does not auto-start! Wait for module selection.
if (!isMock && !window.roomId) {
    setTimeout(loadUserProgress, 800);
} else if (isMock) {
    setTimeout(() => startModule(1), 500);
} else if (window.roomId) {
    // Duel Arena starts immediately
     setTimeout(() => {
        loadUserProgress();
        startModule(1);
     }, 1000);
}

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    wrongAnswers = 0;
    moduleScores = [];
    timeRemaining = MODULE_TIME_LIMIT;

    // UI swap
    elModuleSelection.classList.add("hidden");
    elGameHeader.classList.remove("hidden");
    elGameContainer.classList.remove("hidden");

    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
    loadLevel();
    totalTimeSpent = 0; // Reset for new module session
}

function showModuleSelection() {
    clearInterval(timerInterval);
    elModal.classList.add("hidden"); // Ensure modal is hidden when going back to selection
    elModal.style.display = "none";
    elModuleSelection.classList.remove("hidden");
    elGameHeader.classList.add("hidden");
    elGameContainer.classList.add("hidden");
    loadUserProgress(); // Refresh locks in case they leveled up
}

// --- Game Logic ---

// Determine grid size based on level progression
// e.g., Level 1-3: 3x3, Level 4-6: 4x4, up to 8x8.
function calculateGridSize() {
    let size = Math.floor((currentLevel - 1) / 3) + 3;
    return size;
}

function loadLevel() {
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel}`;
    elScore.innerText = score;

    gridDimensions = calculateGridSize();

    // Select the shapes needed for this grid size
    let currentShapes = [...shapesPool].sort(() => 0.5 - Math.random()).slice(0, gridDimensions);

    // Generate valid latin square (simple sudoku-like grid where no row/col has repeat)
    let gridData = generateLatinSquare(gridDimensions, currentShapes);

    // Pick ONE non-empty random cell to mask as the question
    let maskRow, maskCol;
    do {
        maskRow = Math.floor(Math.random() * gridDimensions);
        maskCol = Math.floor(Math.random() * gridDimensions);
    } while (gridData[maskRow][maskCol] === "");

    targetAnswer = gridData[maskRow][maskCol];
    gridData[maskRow][maskCol] = "?"; // Mask it

    renderGrid(gridData);
    renderOptions(currentShapes);
}

// Generate base latin square by shifting rows
function generateLatinSquare(n, shapes) {
    let baseRow = [...shapes];
    // Shuffle base row
    baseRow.sort(() => 0.5 - Math.random());

    let grid = [];
    for (let i = 0; i < n; i++) {
        let row = [];
        for (let j = 0; j < n; j++) {
            // Shift pattern to ensure no column collisions
            row.push(baseRow[(j + i) % n]);
        }
        grid.push(row);
    }

    // Optionally shuffle rows and columns to make it less predictable
    grid.sort(() => 0.5 - Math.random());
    // Column shuffle requires transposition, skipping for simplicity unless needed.

    // To make it sparse like Sudoku, we could remove more shapes, 
    // but the prompt asked for finding 1 missing shape at a question mark.
    // If the grid gets large, we might want to mask extra distractors.
    let distractorsToMask = Math.floor((n * n) * 0.4); // 40% empty
    let maskedCount = 0;
    while (maskedCount < distractorsToMask) {
        let r = Math.floor(Math.random() * n);
        let c = Math.floor(Math.random() * n);
        if (grid[r][c] !== "" && grid[r][c] !== "?") {
            grid[r][c] = "";
            maskedCount++;
        }
    }

    return grid;
}

// Render the HTML grid
function renderGrid(gridData) {
    elGrid.innerHTML = "";
    elGrid.style.gridTemplateColumns = `repeat(${gridDimensions}, 1fr)`;
    elGrid.style.gridTemplateRows = `repeat(${gridDimensions}, 1fr)`;

    for (let r = 0; r < gridDimensions; r++) {
        for (let c = 0; c < gridDimensions; c++) {
            let cell = document.createElement("div");
            cell.className = "sudoku-cell";

            let val = gridData[r][c];
            if (val === "?") {
                cell.classList.add("question-cell");
                cell.innerText = "?";
            } else if (val !== "") {
                let shapeEl = document.createElement("div");
                shapeEl.className = `shape ${val}`;
                cell.appendChild(shapeEl);
            }

            elGrid.appendChild(cell);
        }
    }
}

// Render the bottom multiple choice buttons
function renderOptions(shapes) {
    elOptions.innerHTML = "";

    // Ensure the options are shuffled
    let shuffledShapes = [...shapes].sort(() => 0.5 - Math.random());

    shuffledShapes.forEach(shape => {
        let btn = document.createElement("button");
        btn.className = "option-btn";

        let shapeEl = document.createElement("div");
        shapeEl.className = `shape ${shape}`;

        btn.appendChild(shapeEl);

        btn.addEventListener("click", () => handleAnswer(shape));
        elOptions.appendChild(btn);
    });
}

const shapeNames = {
    "shape-square": "Square",
    "shape-circle": "Circle",
    "shape-triangle": "Triangle",
    "shape-star": "Star",
    "shape-diamond": "Diamond",
    "shape-cross": "Cross",
    "shape-pentagon": "Pentagon",
    "shape-hexagon": "Hexagon"
};

function handleAnswer(selectedShape) {
    clearInterval(timerInterval); // Pause timer
    let allBtns = elOptions.querySelectorAll(".option-btn");
    allBtns.forEach(btn => btn.style.pointerEvents = "none");

    const feedbackBox = document.createElement("div");
    feedbackBox.style.position = "fixed";
    feedbackBox.style.top = "50%";
    feedbackBox.style.left = "50%";
    feedbackBox.style.transform = "translate(-50%, -50%)";
    feedbackBox.style.padding = "2.5rem 4rem";
    feedbackBox.style.borderRadius = "var(--radius-lg)";
    feedbackBox.style.textAlign = "center";
    feedbackBox.style.zIndex = "1000";
    feedbackBox.style.boxShadow = "var(--shadow-xl)";
    feedbackBox.style.minWidth = "350px";
    document.body.appendChild(feedbackBox);

    let isCorrect = selectedShape === targetAnswer;

    if (isCorrect) {
        correctAnswers++;
        score += 3;
        updateDuelScore(); // Sync duel progress
        if (elScore) elScore.innerText = score;
        sounds.correct.play().catch(e => console.log("Audio play blocked"));
        feedbackBox.innerHTML = `
            <h1 style="font-size: 3rem; margin-bottom: 0.5rem;">CORRECT!</h1>
            <p style="font-size: 1.2rem; color: #166534;">+3 MARKS</p>
        `;
        feedbackBox.style.backgroundColor = "#dcfce7";
        feedbackBox.style.color = "#166534";
    } else {
        wrongAnswers++;
        sounds.wrong.play().catch(e => console.log("Audio play blocked"));
        const correctName = shapeNames[targetAnswer] || "this shape";
        feedbackBox.innerHTML = `
            <h1 style="font-size: 3rem; margin-bottom: 0.5rem;">WRONG!</h1>
            <p style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">The correct answer was: <strong>${correctName}</strong></p>
            <div style="display: flex; justify-content: center; margin-bottom: 1rem;">
                <div class="shape ${targetAnswer}" style="width: 60px; height: 60px;"></div>
            </div>
            <p style="font-size: 1rem; margin-top: 0.5rem; opacity: 0.8;">Reason: Each row and column must have unique shapes.</p>
        `;
        feedbackBox.style.backgroundColor = "#fee2e2";
        feedbackBox.style.color = "#991b1b";

        allBtns.forEach(btn => {
            const shapeDiv = btn.querySelector('.shape');
            if (shapeDiv && shapeDiv.classList.contains(targetAnswer)) {
                btn.style.borderColor = "#166534";
                btn.style.boxShadow = "0 0 15px rgba(22, 101, 52, 0.5)";
                btn.style.borderWidth = "4px";
            }
        });
    }

    setTimeout(() => {
        feedbackBox.remove();
        currentLevel++;
        
        if (currentLevel > LEVELS_PER_MODULE) {
            endModule();
        } else {
            loadLevel();
            startTimer(); // Resume timer
        }
    }, 1200);
}

// --- Timer ---
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            timeRemaining = 0; // Clamp
            clearInterval(timerInterval);
            endModule("Time's Up!");
            updateTimerDisplay(); // Final update to show 00:00
            return;
        }
        timeRemaining--;
        totalTimeSpent++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const displayTime = Math.max(0, timeRemaining);
    let m = Math.floor(displayTime / 60);
    let s = displayTime % 60;
    elTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (timeRemaining < 60) {
        elTimer.classList.add("text-error");
    } else {
        elTimer.classList.remove("text-error");
    }
}

async function saveScoreToAgy(btnElement, redirectCallback) {
    if (moduleScores.length === 0) {
        if (redirectCallback) redirectCallback();
        return;
    }

    if (btnElement) {
        btnElement.innerText = "Saving Score...";
        btnElement.disabled = true;
    }

    try {
        const activeUser = getCurrentUser();
        if (activeUser) {
            const scoreRef = doc(db, "leaderboards", "sudoku", "scores", activeUser.uid);
            const scoreSnap = await getDoc(scoreRef);
            
            let existingModuleScores = {};
            if (scoreSnap.exists()) {
                const oldData = scoreSnap.data();
                if (oldData.moduleScores) existingModuleScores = oldData.moduleScores;
            }

            existingModuleScores[currentModule] = score;

            let totalScore = 0;
            for (const mod in existingModuleScores) {
                totalScore += existingModuleScores[mod];
            }

            await setDoc(scoreRef, {
                name: activeUser.displayName || "Anonymous Player",
                score: totalScore,
                moduleScores: existingModuleScores,
                metrics: {
                    correctCount: correctAnswers,
                    totalMarks: totalScore,
                    lastModuleMarks: score,
                    timeSpent: totalTimeSpent
                },
                timestamp: new Date()
            }, { merge: true });

            // 1. Progression & Denormalization
            const userDocRef = doc(db, "users", activeUser.uid);
            await setDoc(userDocRef, {
                totalScore: increment(correctAnswers),
                modulesCompleted: increment(1),
                lastPlayed: new Date()
            }, { merge: true });

            // 3. WEEKLY LEADERBOARD (New)
            try {
                const weekId = getISOWeekString();
                const weeklyRef = doc(db, "weekly_leaderboards", weekId, "scores", activeUser.uid);
                await setDoc(weeklyRef, {
                    name: activeUser.displayName || "Anonymous Player",
                    score: increment(score),
                    timestamp: serverTimestamp()
                }, { merge: true });
            } catch (weeklyError) {
                console.warn("Weekly leaderboard save failed:", weeklyError);
            }

            // 4. COLLEGE LEADERBOARD (New)
            try {
                const userSnap = await getDoc(doc(db, "users", activeUser.uid));
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
        }
    } catch (error) {
        Logger.handleFirestoreError("saveScore_sudoku", error);
    }

    if (redirectCallback) redirectCallback();
}

// --- Module Progression ---
async function endModule(customTitle) {
    clearInterval(timerInterval);
    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }
    sounds.complete.play().catch(e => console.log("Audio play blocked"));
    ActivityLogger.log('solve', 'sudoku');
    
    // Confetti celebration
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#c90076', '#ff4b2b', '#3b82f6']
        });
    }

    elModalTitle.innerText = customTitle || `Module ${currentModule} Complete`;
    document.getElementById('score-text').innerText = `${correctAnswers}`;
    document.getElementById('correct-count').innerText = correctAnswers;
    document.getElementById('wrong-count').innerText = wrongAnswers;
    document.getElementById('final-marks').innerText = score;

    moduleScores.push(correctAnswers);
    saveScoreToAgy(null, null); // Autosave in background

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
        elNextBtn.onclick = nextModule;
    }

    // Add LinkedIn Share Button
    let linkedinBtn = document.getElementById('linkedin-share-btn');
    if (!linkedinBtn) {
        linkedinBtn = document.createElement('button');
        linkedinBtn.id = 'linkedin-share-btn';
        linkedinBtn.className = 'btn btn-outline';
        linkedinBtn.style.marginTop = '0.5rem';
        linkedinBtn.style.width = '100%';
        linkedinBtn.innerHTML = '<i class="fab fa-linkedin"></i> Share on LinkedIn';
        linkedinBtn.onclick = shareOnLinkedIn;
        elModal.querySelector('.modal-content').appendChild(linkedinBtn);
    }

    // Also provide a button to go back to selection
    let backBtn = document.getElementById("modal-back-btn");
    if (!backBtn) {
        backBtn = document.createElement("button");
        backBtn.id = "modal-back-btn";
        backBtn.className = "btn btn-outline";
        backBtn.style.marginTop = "0.5rem";
        backBtn.style.display = "block";
        backBtn.style.width = "100%";
        elNextBtn.parentNode.insertBefore(backBtn, elNextBtn.nextSibling);
    }
    backBtn.innerText = "Back to Modules";

    backBtn.onclick = () => {
        elModal.classList.add("hidden");
        elModal.style.display = "none";
        showModuleSelection();
        moduleScores = []; 
    };

    const ratingContainer = document.getElementById('rating-section');
    if (ratingContainer) initRatingSystem(ratingContainer);

    elModal.classList.remove("hidden");
    elModal.style.display = "flex";
}

function nextModule() {
    elModal.classList.add("hidden");
    elModal.style.display = "none";
    startModule(currentModule + 1);
}

function shareOnLinkedIn() {
    const text = `I just completed Sudoku Challenge Module ${currentModule} on AptiVerse with ${correctAnswers}/${LEVELS_PER_MODULE} correct! 🚀 #AptitudeReasoning #AptiVerse`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'width=600,height=400');
}
