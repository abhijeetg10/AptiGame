import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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
let highestUnlockedModule = 1;
let currentModule = 1;
let currentLevel = 1;
let correctAnswers = 0;
let wrongAnswers = 0;
let timeRemaining = INITIAL_TIME;
let timerInterval;
let moduleScores = [];

let gridDimensions = 3; // Starts at 3x3
let targetAnswer = "";
let currentReason = "";
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

// Inductive UI targets
const elBoardRefA = document.getElementById("grid-ref-a");
const elBoardRefB = document.getElementById("grid-ref-b");
const elBoardPromptA = document.getElementById("grid-prompt-a");
const elChoices = document.getElementById("choices-container");

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
                if (data.highestModule_inductive) {
                    highestUnlockedModule = data.highestModule_inductive;
                }
            }
        } catch (e) {
            console.error("Error loading user progress:", e);
        }
    }
    
    // Update UI locks
    moduleBtns.forEach(btn => {
        let modNum = parseInt(btn.getAttribute("data-module"));
        if (modNum > highestUnlockedModule) {
            btn.style.opacity = "0.5";
            btn.style.pointerEvents = "none";
            btn.title = "Complete the previous module to unlock";
        } else {
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.title = "Click to play";
        }
    });
}

// Ensure game does not auto-start! Wait for module selection.
setTimeout(loadUserProgress, 1000); // Small delay to ensure auth is fully ready

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
    correctAnswers = 0;
    wrongAnswers = 0;
    moduleScores = [];
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
    loadUserProgress();
}

// --- Challenge Generator Engine ---

function calculateGridSize() {
    // Scales playfully: 3x3 for Mod1, 4x4 Mod2, 5x5 Mod3, 6x6 Mod4, 7x7 Mod5
    let size = 2 + currentModule;
    let finalSize = Math.min(size, 7); // Max 7x7

    // Dynamically scale CSS variables to prevent overflow on 6x6 and 7x7
    if (finalSize >= 6) {
        document.documentElement.style.setProperty('--cell-size', '22px');
        document.documentElement.style.setProperty('--shape-size', '14px');
    } else if (finalSize === 5) {
        document.documentElement.style.setProperty('--cell-size', '32px');
        document.documentElement.style.setProperty('--shape-size', '20px');
    } else {
        document.documentElement.style.setProperty('--cell-size', '45px');
        document.documentElement.style.setProperty('--shape-size', '28px');
    }

    return finalSize;
}

// Generate random grid data
function generateRandomGrid(size, colorPool) {
    let grid = [];
    for (let r = 0; r < size; r++) {
        let row = [];
        for (let c = 0; c < size; c++) {
            // ~70% chance of being empty to make patterns easier to spot
            if (Math.random() < 0.7) {
                row.push(null);
            } else {
                let shape = shapesPool[Math.floor(Math.random() * shapesPool.length)];
                let color = colorPool[Math.floor(Math.random() * colorPool.length)];
                row.push({ shape, color });
            }
        }
        grid.push(row);
    }
    return grid;
}

// Deep clone Helper
function cloneGrid(grid) {
    return grid.map(row => row.map(cell => cell ? { ...cell } : null));
}

// --- Rules (Static Properties) ---
// Each rule takes an existing grid of noise, and injects a specific geometric property 
// using a single target shape and color.
const RULES = {
    FOUR_CORNERS: {
        text: "The same shape is in all 4 corners.",
        apply: (grid, stateObj) => {
            let size = grid.length;
            let newGrid = cloneGrid(grid);
            let { targetShape, targetColor } = stateObj;
            newGrid[0][0] = { shape: targetShape, color: targetColor };
            newGrid[0][size - 1] = { shape: targetShape, color: targetColor };
            newGrid[size - 1][0] = { shape: targetShape, color: targetColor };
            newGrid[size - 1][size - 1] = { shape: targetShape, color: targetColor };
            return newGrid;
        }
    },
    DIAGONAL_LINE: {
        text: "A continuous diagonal line of the same shape.",
        apply: (grid, stateObj) => {
            let size = grid.length;
            let newGrid = cloneGrid(grid);
            let { targetShape, targetColor } = stateObj;
            // randomly choose main or anti-diagonal
            let isMain = Math.random() > 0.5;
            for (let i = 0; i < size; i++) {
                if (isMain) {
                    newGrid[i][i] = { shape: targetShape, color: targetColor };
                } else {
                    newGrid[i][size - 1 - i] = { shape: targetShape, color: targetColor };
                }
            }
            return newGrid;
        }
    },
    CENTER_PIECE: {
        text: "A specific shape is always dead center.",
        apply: (grid, stateObj) => {
            let size = grid.length;
            let newGrid = cloneGrid(grid);
            let { targetShape, targetColor } = stateObj;
            let centerPos = Math.floor(size / 2);
            newGrid[centerPos][centerPos] = { shape: targetShape, color: targetColor };
            // Add a surrounding "frame" to make it more obvious on bigger grids
            if (size > 3) {
                newGrid[centerPos - 1][centerPos] = { shape: targetShape, color: targetColor };
                newGrid[centerPos + 1][centerPos] = { shape: targetShape, color: targetColor };
                newGrid[centerPos][centerPos - 1] = { shape: targetShape, color: targetColor };
                newGrid[centerPos][centerPos + 1] = { shape: targetShape, color: targetColor };
            }
            return newGrid;
        }
    },
    L_SHAPE: {
        text: "Forms an 'L' shape pattern.",
        apply: (grid, stateObj) => {
            let size = grid.length;
            let newGrid = cloneGrid(grid);
            let { targetShape, targetColor } = stateObj;

            // Build an L shape anchored near top-left
            let L_size = Math.max(3, Math.floor(size / 1.5));
            let startR = 1;
            let startC = 1;

            // Vertical bar
            for (let i = 0; i < L_size; i++) {
                if (startR + i < size) {
                    newGrid[startR + i][startC] = { shape: targetShape, color: targetColor };
                }
            }
            // Horizontal bar
            for (let i = 0; i < L_size; i++) {
                if (startC + i < size) {
                    newGrid[startR + L_size - 1][startC + i] = { shape: targetShape, color: targetColor };
                }
            }
            return newGrid;
        }
    }
};

// Global selection tracking
let selectedOptions = [];
let correctPairIndices = [];

function loadLevel() {
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    selectedOptions = [];

    gridDimensions = calculateGridSize();

    // Select distinct colors for this level to mix it up visually
    let allColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    let colorPool = allColors.sort(() => 0.5 - Math.random()).slice(0, 3 + Math.floor(currentModule / 2));

    // 1. Pick a random Rule & Target Feature
    let ruleKeys = Object.keys(RULES);
    let chosenRuleKey = ruleKeys[Math.floor(Math.random() * ruleKeys.length)];
    let ruleObj = RULES[chosenRuleKey];

    // Pick a specific shape/color that the rule will use
    let targetShape = shapesPool[Math.floor(Math.random() * shapesPool.length)];
    let targetColor = colorPool[Math.floor(Math.random() * colorPool.length)];
    let ruleState = { targetShape, targetColor, colorPool };

    currentReason = ruleObj.text;

    // 2. Generate the Reference grids (Both demonstrate the static property)
    let refNoiseA = generateRandomGrid(gridDimensions, colorPool);
    let refGridA = ruleObj.apply(refNoiseA, ruleState);

    let refNoiseB = generateRandomGrid(gridDimensions, colorPool);
    let refGridB = ruleObj.apply(refNoiseB, ruleState);

    // 3. Generate 4 Option Grids. Two must be correct.
    let options = []; // Array of objects: [{grid, isCorrect}]

    // Correct Grid 1
    let promptNoiseA1 = generateRandomGrid(gridDimensions, colorPool);
    options.push({
        grid: ruleObj.apply(promptNoiseA1, ruleState),
        isCorrect: true
    });

    // Correct Grid 2
    let promptNoiseA2 = generateRandomGrid(gridDimensions, colorPool);
    options.push({
        grid: ruleObj.apply(promptNoiseA2, ruleState),
        isCorrect: true
    });

    // Decoy Grid 1 (Pure noise)
    let decoy1Noise = generateRandomGrid(gridDimensions, colorPool);
    options.push({
        grid: decoy1Noise,
        isCorrect: false
    });

    // Decoy Grid 2 (Pure noise)
    let decoy2Noise = generateRandomGrid(gridDimensions, colorPool);
    options.push({
        grid: decoy2Noise,
        isCorrect: false
    });

    // Shuffle options
    options.sort(() => 0.5 - Math.random());

    // Find the indices of the two correct pairs after shuffling
    correctPairIndices = [];
    options.forEach((opt, idx) => {
        if (opt.isCorrect) correctPairIndices.push(idx);
    });

    // 5. Render
    renderGridBoard(elBoardRefA, refGridA);
    renderGridBoard(elBoardRefB, refGridB);
    renderOptions(options);
}

// Render a single structural HTML Grid
function renderGridBoard(containerEl, gridData) {
    containerEl.innerHTML = "";
    containerEl.style.gridTemplateColumns = `repeat(${gridDimensions}, 1fr)`;
    containerEl.style.gridTemplateRows = `repeat(${gridDimensions}, 1fr)`;

    for (let r = 0; r < gridDimensions; r++) {
        for (let c = 0; c < gridDimensions; c++) {
            let cell = document.createElement("div");
            cell.className = "ind-cell";

            let data = gridData[r][c];
            if (data) {
                let shapeEl = document.createElement("div");
                shapeEl.className = `shape ${data.shape}`;
                shapeEl.style.setProperty('--shape-color', data.color);

                if (data.shape === "shape-triangle") {
                    shapeEl.style.borderBottomColor = data.color;
                } else if (data.shape !== "shape-cross") {
                    shapeEl.style.backgroundColor = data.color;
                }

                cell.appendChild(shapeEl);
            }

            containerEl.appendChild(cell);
        }
    }
}

// Render the 4 interactive bottom options as single grids
function renderOptions(optionsArray) {
    elChoices.innerHTML = "";

    optionsArray.forEach((optData, index) => {
        let btn = document.createElement("button");
        btn.className = "inductive-choice-wrapper";
        btn.style.display = "flex";
        btn.style.flexDirection = "column";
        btn.style.alignItems = "center";
        btn.style.gap = "1rem";

        let miniBoard = document.createElement("div");
        miniBoard.className = "inductive-board";
        renderGridBoard(miniBoard, optData.grid);

        btn.appendChild(miniBoard);

        btn.addEventListener("click", () => handleAnswer(index, btn));
        elChoices.appendChild(btn);
    });
}

function handleAnswer(index, btnEl) {
    // If clicking a selected button, deselect it
    if (selectedOptions.includes(index)) {
        selectedOptions = selectedOptions.filter(i => i !== index);
        btnEl.classList.remove("selected");
        return;
    }

    if (selectedOptions.length >= 2) return;

    selectedOptions.push(index);
    btnEl.classList.add("selected");

    if (selectedOptions.length === 2) {
        let allBtns = elChoices.querySelectorAll(".inductive-choice-wrapper");
        allBtns.forEach(b => b.style.pointerEvents = "none");

        let isCorrect = correctPairIndices.includes(selectedOptions[0]) && correctPairIndices.includes(selectedOptions[1]);

        let reasonBox = document.getElementById("reason-box");
        if (!reasonBox) {
            reasonBox = document.createElement("div");
            reasonBox.id = "reason-box";
            reasonBox.style.marginTop = "1rem";
            reasonBox.style.padding = "1rem";
            reasonBox.style.borderRadius = "8px";
            reasonBox.style.fontWeight = "600";
            reasonBox.style.textAlign = "center";
            elChoices.parentNode.appendChild(reasonBox);
        }

        if (isCorrect) {
            reasonBox.innerText = `Correct! Rule: ${currentReason}`;
            reasonBox.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
            reasonBox.style.color = "#10b981";

            allBtns[selectedOptions[0]].classList.add("correct-selection");
            allBtns[selectedOptions[1]].classList.add("correct-selection");
            correctAnswers++;
            setTimeout(() => {
                reasonBox.remove();
                advanceLevel();
            }, 1800);
        } else {
            reasonBox.innerText = `Incorrect! The actual Rule was: ${currentReason}`;
            reasonBox.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
            reasonBox.style.color = "#ef4444";

            allBtns[selectedOptions[0]].classList.add("wrong-selection");
            allBtns[selectedOptions[1]].classList.add("wrong-selection");
            wrongAnswers++;
            setTimeout(() => {
                allBtns[selectedOptions[0]].classList.remove("wrong-selection", "selected");
                allBtns[selectedOptions[1]].classList.remove("wrong-selection", "selected");
                selectedOptions = [];
                allBtns.forEach(b => b.style.pointerEvents = "auto"); // Restore clicks after failure
                reasonBox.remove();
            }, 2500);
        }
    }
}

function advanceLevel() {
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
            const scoreRef = doc(db, "leaderboards", "inductive", "scores", activeUser.uid);
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

            if (existingModuleScores[currentModule] === undefined || correctAnswers > existingModuleScores[currentModule]) {
                existingModuleScores[currentModule] = correctAnswers;
            }

            let totalScore = 0;
            let totalPossible = 0;
            for (const mod in existingModuleScores) {
                totalScore += existingModuleScores[mod];
                totalPossible += LEVELS_PER_MODULE; 
            }

            const scoreData = {
                name: playerName,
                score: totalScore, 
                totalLevels: totalPossible,
                moduleScores: existingModuleScores,
                timestamp: new Date()
            };
            await setDoc(scoreRef, scoreData);

            // Save Module Progression
            const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1); // Unlock the next one
            if (moduleReached > highestUnlockedModule) {
                highestUnlockedModule = moduleReached;
                const userDocRef = doc(db, "users", activeUser.uid);
                await updateDoc(userDocRef, {
                    highestModule_inductive: highestUnlockedModule
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
            await addDoc(collection(db, "leaderboards", "inductive", "scores"), scoreData);
        }
        
        if (btnElement) {
            btnElement.innerText = "Score Saved!";
        }
    } catch (error) {
        console.error("Error saving score to Firebase:", error);
        if (btnElement) {
            btnElement.innerText = "Save Failed";
            btnElement.disabled = false;
        }
    }

    if (redirectCallback) {
        setTimeout(redirectCallback, 500); // slight delay
    }
}

// --- Module Progression ---
async function endModule(customTitle) {
    clearInterval(timerInterval);

    elModalTitle.innerText = customTitle || `Module ${currentModule} Complete`;
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elCorrectCount.innerText = correctAnswers;
    elWrongCount.innerText = wrongAnswers;

    moduleScores.push(correctAnswers);
    saveScoreToFirebase(null, null); // Autosave in background

    const isGameOver = currentModule >= TOTAL_MODULES || customTitle === "Time's Up!";

    if (isGameOver) {
        saveScoreToFirebase(elNextBtn, () => {
            window.location.href = "index.html";
        });
    } else {
        elNextBtn.innerText = "Start Next Module";
        elNextBtn.onclick = nextModule;
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
    backBtn.innerText = "Save & Back to Modules";

    backBtn.onclick = () => {
        saveScoreToFirebase(backBtn, () => {
            elModal.classList.add("hidden");
            elModal.style.display = "none";
            showModuleSelection();
            moduleScores = []; // Wipe so we do not save again
        });
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
