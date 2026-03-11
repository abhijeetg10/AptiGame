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
const TOTAL_MODULES = 5;
const LEVELS_PER_MODULE = 18;
const INITIAL_TIME = 6 * 60; // 6 minutes in seconds

// --- State ---
let currentModule = 1;
let currentLevel = 1;
let correctAnswers = 0;
let wrongAnswers = 0;
let timeRemaining = INITIAL_TIME;
let timerInterval;

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

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
    correctAnswers = 0;
    wrongAnswers = 0;
    timeRemaining = INITIAL_TIME;

    // UI swap
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

function handleAnswer(selectedShape) {
    if (selectedShape === targetAnswer) {
        correctAnswers++;
        // Visual feedback could be added here
    } else {
        wrongAnswers++;
    }

    if (currentLevel < LEVELS_PER_MODULE) {
        currentLevel++;
        loadLevel();
    } else {
        endModule();
    }
}

// --- Timer ---
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
async function endModule(customTitle) {
    clearInterval(timerInterval);

    elModalTitle.innerText = customTitle || `Module ${currentModule} Complete`;
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elCorrectCount.innerText = correctAnswers;
    elWrongCount.innerText = wrongAnswers;

    if (currentModule >= TOTAL_MODULES) {
        elNextBtn.innerText = "Saving Score...";
        elNextBtn.disabled = true;

        try {
            // Get Active User Data
            const activeUser = getCurrentUser();
            const playerName = activeUser && activeUser.displayName ? activeUser.displayName : "Guest Player";

            // Push Score to "sudoku" Collection
            const scoreData = {
                name: playerName,
                score: correctAnswers, // Stored as Number for sorting
                totalLevels: LEVELS_PER_MODULE,
                timestamp: new Date()
            };

            await addDoc(collection(db, "leaderboards", "sudoku", "scores"), scoreData);
            
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
        elNextBtn.onclick = nextModule;
    }

    // Also provide a button to go back to selection
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

function nextModule() {
    elModal.classList.add("hidden");
    elModal.style.display = "none";
    startModule(currentModule + 1);
}

// Ensure game does not auto-start! Wait for module selection.
// (Removed initGame() call)
