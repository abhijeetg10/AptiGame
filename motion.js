import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";

// --- Auth Guard ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        alert("Authentication required. Redirecting to home page...");
        window.location.href = "index.html";
    }
});

// --- Configuration ---
const TOTAL_MODULES = 10;
const LEVELS_PER_MODULE = 18;
const INITIAL_TIME = 6 * 60; // 6 minutes

const CELL_SIZE = 60; // Pixels per grid cell (fixed for calculation)

// --- State ---
let currentModule = 1;
let currentLevel = 1;
let correctAnswers = 0;
let wrongAnswers = 0;
let currentMoves = 0;
let timeRemaining = INITIAL_TIME;
let timerInterval;
let isTransitioning = false;

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

if (elSkipBtn) {
    elSkipBtn.addEventListener("click", () => {
        wrongAnswers++;
        endModule("Level Skipped", true);
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
    correctAnswers = 0;
    wrongAnswers = 0;
    timeRemaining = INITIAL_TIME;

    elModuleSelection.classList.add("hidden");
    elGameHeader.classList.remove("hidden");
    elGameContainer.classList.remove("hidden");

    startTimer();
    loadLevel();
}

function showModuleSelection() {
    clearInterval(timerInterval);
    elModuleSelection.classList.remove("hidden");
    elGameHeader.classList.add("hidden");
    elGameContainer.classList.add("hidden");
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

function loadLevel() {
    isTransitioning = false;
    currentMoves = 0;
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elMoves.innerText = currentMoves;

    calculateGridSize();

    elBoard.style.width = `${gridWidth * CELL_SIZE}px`;
    elBoard.style.height = `${gridHeight * CELL_SIZE}px`;

    generateSolvableBoard();
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
        elMoves.innerText = currentMoves;

        checkVictory(entity);
    }
}

// Check if a theoretical rect collides with anything
function checkCollisionRect(x, y, w, h, ignoreEntity, holeBlocks = false) {
    // Stage bounds
    if (x < 0 || y < 0 || x + w > gridWidth || y + h > gridHeight) return true;

    for (let e of entities) {
        if (e === ignoreEntity) continue;
        if (e.type === "hole" && !holeBlocks) continue; // Hole doesn't block player movement, but blocks spawning if flag is true

        // AABB Collision
        if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) {
            return true;
        }
    }
    return false;
}

function checkVictory(movedEntity) {
    if (movedEntity.type === "ball" && !isTransitioning) {
        let hole = entities.find(e => e.type === "hole");
        if (movedEntity.x === hole.x && movedEntity.y === hole.y) {
            console.log("Victory Triggered!");
            isTransitioning = true;
            correctAnswers++;

            // Optional visual flourish
            movedEntity.el.style.transform = "scale(0)";
            setTimeout(() => {
                advanceLevel();
            }, 500);
        }
    }
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
        timeRemaining--;
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

// --- Module Progression ---
async function endModule(customTitle, isSkip = false) {
    clearInterval(timerInterval);

    elModalTitle.innerText = customTitle || `Module ${currentModule} Complete`;
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elCorrectCount.innerText = correctAnswers;
    elWrongCount.innerText = wrongAnswers;

    // Show answer button logic
    if (window.currentSolutionPath && window.currentSolutionPath.length > 0) {
        elShowAnswerBtn.classList.remove("hidden");
    } else {
        elShowAnswerBtn.classList.add("hidden");
    }

    if (isSkip) {
        elNextBtn.innerText = "Next Level";
        elNextBtn.onclick = () => {
            elModal.classList.add("hidden");
            elModal.style.display = "none";
            advanceLevel();
            startTimer();
        };
    } else if (currentModule >= TOTAL_MODULES) {
        elNextBtn.innerText = "Saving Score...";
        elNextBtn.disabled = true;

        try {
            const activeUser = getCurrentUser();
            const playerName = activeUser && activeUser.displayName ? activeUser.displayName : "Guest Player";

            const scoreData = {
                name: playerName,
                score: correctAnswers, // Stored as Number for sorting
                totalLevels: LEVELS_PER_MODULE,
                timestamp: new Date()
            };

            await addDoc(collection(db, "leaderboards", "motion", "scores"), scoreData);
            
            elNextBtn.innerText = "Finish Game (Score Saved!)";
            elNextBtn.disabled = false;
        } catch (error) {
            console.error("Error saving score to Firebase:", error);
            elNextBtn.innerText = "Finish Game (Save Failed)";
            elNextBtn.disabled = false;
        }

        elNextBtn.onclick = () => window.location.href = "index.html";
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
        backBtn.innerText = "Back to Modules";
        backBtn.style.marginTop = "0.5rem";
        backBtn.style.display = "block";
        backBtn.style.width = "100%";
        elNextBtn.parentNode.insertBefore(backBtn, elNextBtn.nextSibling);
    }

    backBtn.onclick = () => {
        elModal.classList.add("hidden");
        elModal.style.display = "none";
        showModuleSelection();
    };

    elModal.classList.remove("hidden");
    elModal.style.display = "flex";
}
