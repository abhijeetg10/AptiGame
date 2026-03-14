import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
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

let highestUnlockedModule = 5;
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
    const activeUser = getCurrentUser();
    if (activeUser) {
        try {
            const userDocRef = doc(db, "users", activeUser.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.highestModule_sudoku) {
                    highestUnlockedModule = Math.max(5, data.highestModule_sudoku);
                }
            }
        } catch (e) {
            console.error("Error loading user progress:", e);
        }
    }
    
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

// Ensure game does not auto-start! Wait for module selection.
if (!isMock) {
    setTimeout(loadUserProgress, 1000);
} else {
    setTimeout(() => startModule(1), 500);
}

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
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
    // 1-3 -> 3, 4-6 -> 4, 7-9 -> 5, 10-12 -> 6, 13-15 -> 7, 16-18 -> 8
    let size = Math.floor((currentLevel - 1) / 3) + 3;
    return Math.min(size, 8); // Max 8x8
}

function loadLevel() {
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;

    gridDimensions = calculateGridSize();

    // Select the shapes needed for this grid size
    let currentShapes = [...shapesPool].sort(() => 0.5 - Math.random()).slice(0, gridDimensions);

    // Generate valid latin square (simple sudoku-like grid where no row/col has repeat)
    let gridData = generateLatinSquare(gridDimensions, currentShapes);

    // Pick ONE random cell to mask
    let maskRow = Math.floor(Math.random() * gridDimensions);
    let maskCol = Math.floor(Math.random() * gridDimensions);

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

    if (selectedShape === targetAnswer) {
        correctAnswers++;
        score += 3;
        sounds.correct.play().catch(e => console.log("Audio play blocked"));
        feedbackBox.innerHTML = `
            <h1 style="font-size: 3rem; margin-bottom: 0.5rem;">CORRECT!</h1>
            <p style="font-size: 1.2rem; color: #166534;">+3 MARKS</p>
        `;
        feedbackBox.style.backgroundColor = "#dcfce7";
        feedbackBox.style.color = "#166534";
    } else {
        wrongAnswers++;
        // No negative mark
        sounds.wrong.play().catch(e => console.log("Audio play blocked"));
        const correctName = shapeNames[targetAnswer] || "this shape";
        feedbackBox.innerHTML = `
            <h1 style="font-size: 3rem; margin-bottom: 0.5rem;">WRONG!</h1>
            <p style="font-size: 1.25rem; font-weight: 600;">The correct answer was: <strong>${correctName}</strong></p>
            <p style="font-size: 1rem; margin-top: 0.5rem; opacity: 0.8;">Reason: Each row and column must have unique shapes.</p>
        `;
        feedbackBox.style.backgroundColor = "#fee2e2";
        feedbackBox.style.color = "#991b1b";

        // Highlight the correct option
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
        if (currentLevel < LEVELS_PER_MODULE) {
            currentLevel++;
            loadLevel();
            startTimer(); // Resume timer
        } else {
            endModule();
        }
    }, 2500); // Increased time to read explanation
}

// --- Timer ---
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeRemaining--;
        totalTimeSpent++;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            endModule("Time's Up!");
        }
    }, 1000);
}

function updateTimerDisplay() {
    let m = Math.floor(timeRemaining / 60);
    let s = timeRemaining % 60;
    elTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (timeRemaining < 60) {
        elTimer.classList.add("text-error");
    } else {
        elTimer.classList.remove("text-error");
    }
}

async function saveScoreToFirebase(btnElement, redirectCallback) {
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
        const playerName = activeUser && activeUser.displayName ? activeUser.displayName : "Guest Player";

        if (activeUser) {
            // Cumulative Module Scoring & Deduplication (PB)
            const scoreRef = doc(db, "leaderboards", "sudoku", "scores", activeUser.uid);
            const scoreSnap = await getDoc(scoreRef);
            
            let existingModuleScores = {};
            if (scoreSnap.exists()) {
                const oldData = scoreSnap.data();
                if (oldData.moduleScores) {
                    existingModuleScores = oldData.moduleScores;
                } else if (typeof oldData.score === "number") {
                    existingModuleScores["1"] = oldData.score; // Legacy migration
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

            const scoreData = {
                name: playerName,
                score: totalScore, // Marks
                totalLevels: totalPossible,
                moduleScores: existingModuleScores,
                metrics: {
                    correctAnswers: correctAnswers, // For accuracy
                    timeSpent: totalTimeSpent
                },
                timestamp: new Date()
            };
            await setDoc(scoreRef, scoreData);

            // Save Module Progression
            const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1); // Unlock the next one
            if (moduleReached > highestUnlockedModule) {
                highestUnlockedModule = moduleReached;
                const userDocRef = doc(db, "users", activeUser.uid);
                await updateDoc(userDocRef, {
                    highestModule_sudoku: highestUnlockedModule
                });
            }
        } else {
            // Guest fallback (Optional)
            const scoreData = {
                name: playerName,
                score: correctAnswers, 
                totalLevels: LEVELS_PER_MODULE,
                timestamp: new Date()
            };
            await addDoc(collection(db, "leaderboards", "sudoku", "scores"), scoreData);
        }
        
        if (btnElement) {
            btnElement.innerText = "Score Saved!";
        }
    } catch (error) {
        Logger.handleFirestoreError("saveScore_sudoku", error);
        if (btnElement) {
            btnElement.innerText = "Save Failed";
            btnElement.disabled = false;
        }
    }

    if (redirectCallback) {
        setTimeout(redirectCallback, 500); // slight delay to show "Saved!"
    }

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
    }
}

// --- Module Progression ---
async function endModule(customTitle) {
    clearInterval(timerInterval);
    sounds.complete.play().catch(e => console.log("Audio play blocked"));
    
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
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elCorrectCount.innerText = correctAnswers;
    elWrongCount.innerText = wrongAnswers;

    moduleScores.push(correctAnswers);
    saveScoreToFirebase(null, null); // Autosave in background

    const isGameOver = currentModule >= TOTAL_MODULES || customTitle === "Time's Up!";

    if (isGameOver) {
        elNextBtn.innerText = "Finish & Exit";
        elNextBtn.onclick = () => {
            saveScoreToFirebase(elNextBtn, () => {
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

// Ensure game does not auto-start! Wait for module selection.
// (Removed initGame() call)
