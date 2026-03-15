import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
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
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT, POINTS_PER_CORRECT } = GAME_CONFIG;

// --- Sound Effects ---
const sounds = {
    correct: new Audio('assets/sounds/correct.mp3'),
    wrong: new Audio('assets/sounds/wrong.mp3'),
    complete: new Audio('assets/sounds/complete.mp3')
};

const CELL_SIZE = 60; // Pixels per grid cell (fixed for calculation)

// --- State ---
let highestUnlockedModule = 10;
let currentModule = 1;
let currentLevel = 1;
let correctAnswers = 0;
let wrongAnswers = 0;
let score = 0;
let currentMoves = 0;
let totalMovesPlayed = 0;
let totalMinMovesPossible = 0;
let timeRemaining = MODULE_TIME_LIMIT;
let timerInterval;
let isTransitioning = false;
let moduleScores = [];
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';
let isSkip = false;

let gridWidth = 6;
let gridHeight = 6;
let entities = []; // { id, x, y, w, h, type, el, isSticky, axis }

// --- DOM Elements ---
const elModuleSelection = document.getElementById("module-selection");
const elGameHeader = document.getElementById("game-header");
const elGameContainer = document.getElementById("game-container");
const moduleBtns = document.querySelectorAll(".module-card");
const elBackToModulesBtn = document.getElementById("back-to-modules-btn");

const elModule = document.getElementById("module-display");
const elLevel = document.getElementById("level-display");
const elMoves = document.getElementById("moves-display");
const elTimer = document.getElementById("timer-display");
const elBoard = document.getElementById("motion-board");
const elSkipBtn = document.getElementById("skip-btn");

const elModal = document.getElementById("results-modal");
const elModalTitle = document.getElementById("modal-title");
const elScoreText = document.getElementById("score-text");
const elCorrectCount = document.getElementById("correct-count");
const elWrongCount = document.getElementById("wrong-count");
const elShowAnswerBtn = document.getElementById("show-answer-btn");
const elNextBtn = document.getElementById("next-module-btn");

// --- Initialization & Flow ---
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
                if (data.highestModule_motion) {
                    highestUnlockedModule = 10; // Forced unlock for all users as per request
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
    // Auto-start in mock mode
    setTimeout(() => startModule(1), 500);
}

if (elSkipBtn) {
    elSkipBtn.addEventListener("click", () => {
        clearInterval(timerInterval); // Pause timer
        wrongAnswers++;
        sounds.wrong.play().catch(e => console.log("Audio play blocked"));
        showFeedbackPopup("LEVEL SKIPPED", "#f1f5f9", "#64748b");
        setTimeout(advanceLevel, 1000);
        startTimer(); // Resume timer
    });
}

if (elShowAnswerBtn) {
    elShowAnswerBtn.addEventListener("click", () => {
        playSolution();
    });
}

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    wrongAnswers = 0;
    moduleScores = [];
    timeRemaining = MODULE_TIME_LIMIT;

    elModuleSelection.classList.add("hidden");
    elGameHeader.classList.remove("hidden");
    elGameContainer.classList.remove("hidden");

    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
    loadLevel();
    totalMovesPlayed = 0; // Reset for new module
    totalMinMovesPossible = 0;
}

function showModuleSelection() {
    clearInterval(timerInterval);
    elModuleSelection.classList.remove("hidden");
    elGameHeader.classList.add("hidden");
    elGameContainer.classList.add("hidden");
    loadUserProgress();
}

function clearBoard() {
    elBoard.innerHTML = "";
    entities = [];
}

// --- Level Generation ---
function calculateGridSize() {
    // Scales loosely from 6x6 to 8x8 based on progress
    let size = Math.min(8, 6 + Math.floor((currentLevel - 1) / 6));
    gridWidth = size;
    gridHeight = size;
}

let movesLimit = 0;

function loadLevel() {
    isTransitioning = false;
    currentMoves = 0;
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;

    calculateGridSize();

    elBoard.style.width = `${gridWidth * CELL_SIZE}px`;
    elBoard.style.height = `${gridHeight * CELL_SIZE}px`;

    generateSolvableBoard();
    
    // Calculate moves limit (minimum + offset of 3 or 4)
    const minMovesCount = window.currentSolutionPath ? window.currentSolutionPath.length : 0;
    movesLimit = minMovesCount + (Math.floor(Math.random() * 2) + 3);
    totalMinMovesPossible += minMovesCount;
    updateMovesDisplay();
    
    const elScore = document.getElementById('score-display');
    if (elScore) elScore.innerText = score;
}

function updateMovesDisplay() {
    elMoves.innerText = `${currentMoves} / ${movesLimit}`;
    if (currentMoves >= movesLimit) {
        elMoves.style.color = "#ef4444";
    } else {
        elMoves.style.color = "inherit";
    }
}

function generateSolvableBoard() {
    let isSolvable = false;
    let fallbackCounter = 0;

    do {
        clearBoard();

        // 1. Place the hole at an edge
        const holeX = gridWidth - 1;
        const holeY = Math.floor(gridHeight / 2);
        addEntity("target-hole", holeX, holeY, 1, 1, "hole", false, "none");

        // 2. Place the ball
        const ballX = 0;
        // Don't always start exactly on the same Y as the hole
        let ballY = Math.floor(Math.random() * gridHeight);
        if (gridWidth > 6 && ballY === holeY) ballY = (ballY + 2) % gridHeight;
        addEntity("player-ball", ballX, ballY, 1, 1, "ball", false, "all");

        // 3. Place hurdles based on level
        // Reduce hurdles slightly if falling back repeatedly
        let hurdleReduction = Math.floor(fallbackCounter / 10);
        let numHurdles = Math.max(0, 2 + Math.floor((currentLevel + (currentModule * 2)) / 2) - hurdleReduction);
        let attempts = 0;

        while (entities.length - 2 < numHurdles && attempts < 100) {
            attempts++;

            let isVertical = Math.random() > 0.5;
            let w = isVertical ? 1 : (2 + Math.floor(Math.random() * 2));
            let h = isVertical ? (2 + Math.floor(Math.random() * 2)) : 1;

            let stickyChance = Math.min(0.3, (currentLevel + currentModule) * 0.02);
            let isSticky = Math.random() < stickyChance;
            let axis = isVertical ? "v" : "h";
            if (isSticky) axis = "none";

            let tx = Math.floor(Math.random() * (gridWidth - w + 1));
            let ty = Math.floor(Math.random() * (gridHeight - h + 1));

            // Use includeHole = true to ensure hurdles don't block the target or overlap the ball
            if (!checkCollisionRect(tx, ty, w, h, null, true)) {
                addEntity(`hurdle-${attempts}`, tx, ty, w, h, "hurdle", isSticky, axis);
            }
        }

        // Run BFS
        let solution = solveBoard();
        if (solution !== false) {
            isSolvable = true;
            window.currentSolutionPath = solution; // Save globally for replay
            window.initialBoardState = backupState();
            console.log("Solvable board generated in", fallbackCounter + 1, "attempts. Solution length:", solution.length);
        } else {
            fallbackCounter++;
        }

    } while (!isSolvable && fallbackCounter < 50);

    if (!isSolvable) {
        console.error("Failed to generate a solvable board after 50 attempts. Generating an empty board.");
        clearBoard();
        addEntity("target-hole", gridWidth - 1, Math.floor(gridHeight / 2), 1, 1, "hole", false, "none");
        addEntity("player-ball", 0, Math.floor(gridHeight / 2), 1, 1, "ball", false, "all");
        window.currentSolutionPath = solveBoard();
        window.initialBoardState = backupState();
    }
}

// State backup utility for replay
function backupState() {
    return entities.map(e => ({ id: e.id, x: e.x, y: e.y }));
}

function addEntity(id, x, y, w, h, type, isSticky, axis) {
    let el = document.createElement("div");
    el.className = `entity-block`;

    if (type === "ball") el.classList.add("entity-ball");
    else if (type === "hole") el.classList.add("entity-hole");
    else if (type === "hurdle") {
        el.classList.add(isSticky ? "entity-sticky-hurdle" : "entity-hurdle");
    }

    el.style.width = `${w * CELL_SIZE}px`;
    el.style.height = `${h * CELL_SIZE}px`;
    el.style.left = `${x * CELL_SIZE}px`;
    el.style.top = `${y * CELL_SIZE}px`;

    let entity = { id, x, y, w, h, type, el, isSticky, axis };
    entities.push(entity);
    elBoard.appendChild(el);

    if (type !== "hole" && !isSticky) {
        if (axis === "h" || axis === "all") {
            let leftArrow = document.createElement("div");
            leftArrow.className = "arrow-btn arrow-left";
            leftArrow.innerHTML = "←";
            leftArrow.addEventListener("click", (e) => onArrowClick(e, entity, -1, 0));
            el.appendChild(leftArrow);

            let rightArrow = document.createElement("div");
            rightArrow.className = "arrow-btn arrow-right";
            rightArrow.innerHTML = "→";
            rightArrow.addEventListener("click", (e) => onArrowClick(e, entity, 1, 0));
            el.appendChild(rightArrow);
        }
        if (axis === "v" || axis === "all") {
            let upArrow = document.createElement("div");
            upArrow.className = "arrow-btn arrow-up";
            upArrow.innerHTML = "↑";
            upArrow.addEventListener("click", (e) => onArrowClick(e, entity, 0, -1));
            el.appendChild(upArrow);

            let downArrow = document.createElement("div");
            downArrow.className = "arrow-btn arrow-down";
            downArrow.innerHTML = "↓";
            downArrow.addEventListener("click", (e) => onArrowClick(e, entity, 0, 1));
            el.appendChild(downArrow);
        }
    }
}

// --- Click to Move Mechanics ---
function onArrowClick(e, entity, dx, dy) {
    e.stopPropagation();
    if (entity.isSticky || isTransitioning) return;

    let targetX = entity.x + dx;
    let targetY = entity.y + dy;

    // Attempt Move
    if (!checkCollisionRect(targetX, targetY, entity.w, entity.h, entity)) {
        entity.x = targetX;
        entity.y = targetY;
        entity.el.style.left = `${entity.x * CELL_SIZE}px`;
        entity.el.style.top = `${entity.y * CELL_SIZE}px`;

        currentMoves++;
        totalMovesPlayed++;
        updateMovesDisplay();

        if (currentMoves >= movesLimit) {
            checkVictory(entity, true); // Final check, but if still no win, it will fail
        } else {
            checkVictory(entity);
        }
    }
}

function checkVictory(movedEntity, movesExhausted = false) {
    if (isTransitioning) return;

    let hole = entities.find(e => e.type === "hole");
    const isAtHole = movedEntity.type === "ball" && movedEntity.x === hole.x && movedEntity.y === hole.y;

    if (isAtHole) {
        clearInterval(timerInterval); // Pause timer
        isTransitioning = true;
        correctAnswers++;
        
        // Efficiency Scoring: Min moves = 10, each extra move = -1 mark (floor 2)
        const minMoves = window.currentSolutionPath ? window.currentSolutionPath.length : 0;
        const extraMoves = Math.max(0, currentMoves - minMoves);
        const marksEarned = Math.max(2, 10 - extraMoves);
        score += marksEarned;

        sounds.correct.play().catch(e => console.log("Audio play blocked"));
        showFeedbackPopup(`CORRECT!<br><span style="font-size: 1.2rem;">+${marksEarned} MARKS</span>`, "#dcfce7", "#166534");
        // Optional visual flourish
        movedEntity.el.style.transform = "scale(0)";
        setTimeout(() => {
            advanceLevel();
            startTimer(); // Resume timer
        }, 1200);
    } else if (movesExhausted) {
        clearInterval(timerInterval); // Pause timer
        isTransitioning = true;
        wrongAnswers++;
        // No negative mark

        sounds.wrong.play().catch(e => console.log("Audio play blocked"));
        showFeedbackPopup(`MOVES EXHAUSTED!<br><span style="font-size: 1rem; opacity: 0.8;">Minimum moves were: ${window.currentSolutionPath.length}</span>`, "#fee2e2", "#991b1b");
        setTimeout(() => {
            advanceLevel();
            startTimer(); // Resume timer
        }, 2500);
    }
}

// Helper for feedback popups
function showFeedbackPopup(message, bgColor, textColor) {
    const feedbackBox = document.createElement("div");
    feedbackBox.style.position = "fixed";
    feedbackBox.style.top = "50%";
    feedbackBox.style.left = "50%";
    feedbackBox.style.transform = "translate(-50%, -50%)";
    feedbackBox.style.padding = "2rem 4rem";
    feedbackBox.style.borderRadius = "var(--radius-lg)";
    feedbackBox.style.fontSize = "2rem";
    feedbackBox.style.fontWeight = "800";
    feedbackBox.style.zIndex = "1000";
    feedbackBox.style.backgroundColor = bgColor;
    feedbackBox.style.color = textColor;
    feedbackBox.style.boxShadow = "var(--shadow-xl)";
    feedbackBox.style.textAlign = "center";
    feedbackBox.innerHTML = message;
    document.body.appendChild(feedbackBox);

    setTimeout(() => {
        feedbackBox.remove();
    }, 1000); // Remove after 1 second
}

// --- Solvability Engine (BFS) ---
function serializeState(stateArray) {
    return stateArray.map(e => `${e.x},${e.y}`).join('|');
}

function checkStateCollision(x, y, w, h, ignoreId, stateArray) {
    if (x < 0 || y < 0 || x + w > gridWidth || y + h > gridHeight) return true;
    for (let e of stateArray) {
        if (e.id === ignoreId) continue;
        if (e.type === "hole") continue;
        if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) return true;
    }
    return false;
}

function checkCollisionRect(x, y, w, h, ignoreEntity, includeHole = false) {
    // 1. Check world boundaries
    if (x < 0 || y < 0 || x + w > gridWidth || y + h > gridHeight) return true;
    
    // 2. Check collision with other entities
    for (let e of entities) {
        if (e === ignoreEntity) continue;
        
        // During normal moves, ball can enter hole. 
        // During generation (includeHole=true), hurdles cannot cover the hole.
        if (e.type === "hole" && !includeHole) continue;
        
        if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) {
            return true;
        }
    }
    return false;
}

function solveBoard() {
    let initialState = entities.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, type: e.type, isSticky: e.isSticky, axis: e.axis }));
    let hole = initialState.find(e => e.type === "hole");

    let queue = [{ state: initialState, path: [] }];
    let visited = new Set();
    visited.add(serializeState(initialState));

    // Allow maximum 8000 states to prevent infinite loops on impossible random boards
    let maxIterations = 8000;
    let iterations = 0;

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        let current = queue.shift();
        let currentState = current.state;
        let currentPath = current.path;

        // Check Win Condition
        let ball = currentState.find(e => e.type === "ball");
        if (ball.x === hole.x && ball.y === hole.y) {
            return currentPath; // Found the shortest path!
        }

        // Generate next possible states
        for (let i = 0; i < currentState.length; i++) {
            let ent = currentState[i];
            if (ent.isSticky || ent.type === "hole") continue;

            let possibleMoves = [];
            if (ent.axis === "h" || ent.axis === "all") {
                possibleMoves.push({ dx: -1, dy: 0 });
                possibleMoves.push({ dx: 1, dy: 0 });
            }
            if (ent.axis === "v" || ent.axis === "all") {
                possibleMoves.push({ dx: 0, dy: -1 });
                possibleMoves.push({ dx: 0, dy: 1 });
            }

            for (let move of possibleMoves) {
                let tx = ent.x + move.dx;
                let ty = ent.y + move.dy;

                if (!checkStateCollision(tx, ty, ent.w, ent.h, ent.id, currentState)) {
                    // Valid move, branch state
                    let nextState = currentState.map(e => ({ ...e }));
                    nextState[i].x = tx;
                    nextState[i].y = ty;

                    let stateStr = serializeState(nextState);
                    if (!visited.has(stateStr)) {
                        visited.add(stateStr);
                        queue.push({
                            state: nextState,
                            path: [...currentPath, { id: ent.id, dx: move.dx, dy: move.dy }]
                        });
                    }
                }
            }
        }
    }
    return false; // Unsolvable or too deep
}

function playSolution() {
    if (!window.currentSolutionPath || window.currentSolutionPath.length === 0) return;

    // Hide UI overlays
    elModal.classList.add("hidden");
    elModal.style.display = "none";

    // Setup visual playback state
    elBoard.style.pointerEvents = "none"; // Disable clicking
    elBoard.style.opacity = "0.8";

    // Revert to initial positions
    entities.forEach(ent => {
        let initialSetup = window.initialBoardState.find(b => b.id === ent.id);
        if (initialSetup) {
            ent.x = initialSetup.x;
            ent.y = initialSetup.y;
            ent.el.style.left = `${ent.x * CELL_SIZE}px`;
            ent.el.style.top = `${ent.y * CELL_SIZE}px`;
        }
    });

    let stepIndex = 0;

    let playbackInterval = setInterval(() => {
        if (stepIndex >= window.currentSolutionPath.length) {
            clearInterval(playbackInterval);
            elBoard.style.pointerEvents = "auto";
            elBoard.style.opacity = "1";
            setTimeout(() => {
                // Show modal again after animation is complete
                elModal.classList.remove("hidden");
                elModal.style.display = "flex";
            }, 1000);
            return;
        }

        let move = window.currentSolutionPath[stepIndex];
        let ent = entities.find(e => e.id === move.id);
        if (ent) {
            ent.x += move.dx;
            ent.y += move.dy;
            ent.el.style.left = `${ent.x * CELL_SIZE}px`;
            ent.el.style.top = `${ent.y * CELL_SIZE}px`;

            // Flash effect to draw attention
            ent.el.style.filter = "brightness(1.5)";
            setTimeout(() => { ent.el.style.filter = "none"; }, 250);
        }

        stepIndex++;
    }, 400); // 400ms per move
}

// --- Advancement ---
function advanceLevel() {
    if (currentLevel < LEVELS_PER_MODULE) {
        currentLevel++;
        loadLevel();
    } else {
        endModule();
    }
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (timeRemaining <= 0) {
            timeRemaining = 0;
            clearInterval(timerInterval);
            endModule("Time's Up!");
            updateTimerDisplay();
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
            // 1. PRIORITIZE PROGRESSION
            let progressSaved = false;
            try {
                const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1);
                if (moduleReached > highestUnlockedModule) {
                    highestUnlockedModule = 10;
                    await setDoc(doc(db, "users", activeUser.uid), {
                        highestModule_motion: 10
                    }, { merge: true });
                }
                progressSaved = true;
            } catch (progError) {
                console.error("Motion progression save failed:", progError);
            }

            // 2. ATTEMPT LEADERBOARD (Non-blocking)
            try {
                const scoreRef = doc(db, "leaderboards", "motion", "scores", activeUser.uid);
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
                    name: playerName,
                    score: totalScore,
                    totalLevels: totalPossible,
                    moduleScores: existingModuleScores,
                    metrics: {
                        totalMoves: totalMovesPlayed,
                        minMoves: totalMinMovesPossible,
                        correctLevels: correctAnswers,
                        totalMarks: score
                    },
                    timestamp: new Date()
                }, { merge: true });
            } catch (lbError) {
                console.warn("Motion leaderboard save failed (Permissions?):", lbError);
            }

            if (btnElement) {
                btnElement.innerText = progressSaved ? "Progress Saved!" : "Save Failed";
                if (progressSaved) btnElement.style.backgroundColor = "#10b981";
            }
        } else {
            // Guest fallback
            try {
                await addDoc(collection(db, "leaderboards", "motion", "scores"), {
                    name: playerName,
                    score: correctAnswers, 
                    totalLevels: LEVELS_PER_MODULE,
                    timestamp: new Date()
                });
                if (btnElement) btnElement.innerText = "Score Saved!";
            } catch (guestError) {
                console.error("Guest save failed:", guestError);
                if (btnElement) btnElement.innerText = "Save Failed";
            }
        }
    } catch (error) {
        Logger.handleFirestoreError("saveScore_motion", error);
        if (btnElement) {
            btnElement.innerText = "Save Failed";
            btnElement.disabled = false;
        }
    }


    if (redirectCallback) {
        setTimeout(redirectCallback, 500); // slight delay
    }

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
    }
}

// --- Module Progression ---
async function endModule(customTitle) {
    clearInterval(timerInterval);
    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }
    sounds.complete.play().catch(e => console.log("Audio play blocked"));
    ActivityLogger.log('solve', 'motion');

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
    
    // Display Final Marks
    let marksEl = document.getElementById('final-marks');
    if (marksEl) marksEl.innerText = score;

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

    // Show answer button logic
    if (window.currentSolutionPath && window.currentSolutionPath.length > 0) {
    if (elShowAnswerBtn) elShowAnswerBtn.classList.remove("hidden");
    } else {
        if (elShowAnswerBtn) elShowAnswerBtn.classList.add("hidden");
    }

    if (!isSkip) {
        moduleScores.push(correctAnswers);
        saveScoreToFirebase(null, null); // Autosave in background
    }

    if (isSkip) {
        elNextBtn.innerText = "Next Level";
        elNextBtn.onclick = () => {
            elModal.classList.add("hidden");
            elModal.style.display = "none";
            advanceLevel();
            startTimer();
        };
    } else if (currentModule >= TOTAL_MODULES || customTitle === "Time's Up!") {
        elNextBtn.innerText = "Finish & Exit";
        elNextBtn.onclick = () => {
            saveScoreToFirebase(elNextBtn, () => {
                window.location.href = "index.html";
            });
        };
    } else {
        elNextBtn.innerText = "Start Next Module";
        elNextBtn.onclick = () => {
            elModal.classList.add("hidden");
            elModal.style.display = "none";
            startModule(currentModule + 1);
        };
    }

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

function shareOnLinkedIn() {
    const text = `I just completed Motion Challenge Module ${currentModule} on AptiVerse with ${correctAnswers}/${LEVELS_PER_MODULE} correct! 🚀 #SpatialReasoning #AptiVerse`;
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'width=600,height=400');
}
