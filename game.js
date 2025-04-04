import * as THREE from 'three';

// --- Basic Setup ---
const scene = new THREE.Scene();
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('gameCanvas');

// --- Camera & Renderer Setup ---
const aspectRatio = 9 / 16;
const viewHeight = 16; // World units for visible height
const viewWidth = viewHeight * aspectRatio;

const camera = new THREE.OrthographicCamera(
    viewWidth / -2, viewWidth / 2, // left, right
    viewHeight / 2, viewHeight / -2, // top, bottom
    0.1, 1000
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(gameContainer.clientWidth, gameContainer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

function resizeRenderer() {
    const width = gameContainer.clientWidth;
    const height = gameContainer.clientHeight;
    renderer.setSize(width, height);
    const newAspectRatio = width / height;
    camera.left = viewHeight * newAspectRatio / -2;
    camera.right = viewHeight * newAspectRatio / 2;
    camera.top = viewHeight / 2;
    camera.bottom = viewHeight / -2;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);
// Initial sizing handled after setup

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// --- Player Seed ---
const seedRadius = 0.5;
const seedGeometry = new THREE.SphereGeometry(seedRadius, 32, 16);
const seedMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffff, emissive: 0x008888, roughness: 0.3, metalness: 0.6
});
const seed = new THREE.Mesh(seedGeometry, seedMaterial);
seed.position.x = -viewWidth / 3; // Start position adjusted slightly
seed.position.y = 0;
// Compute bounding sphere/box for collision checks
seed.geometry.computeBoundingSphere();
seed.geometry.computeBoundingBox(); // Also compute box for simpler AABB check
scene.add(seed);

// --- Physics & Game Constants ---
let seedVelocityY = 0;
const gravity = 0.015;
const surgeStrength = 0.45;
const seedMinY = viewHeight / -2 + seedRadius;
const seedMaxY = viewHeight / 2 - seedRadius;

let gameStarted = false;
let gameOver = false;
let score = 0;

// --- Obstacle Constants ---
const obstacles = []; // Array to hold active obstacles
const obstacleWidth = 1.5;
const obstacleMinGap = 4.0; // Minimum vertical gap between obstacles
const obstacleMaxGap = 5.5; // Maximum vertical gap
const obstacleSpawnX = viewWidth / 2 + obstacleWidth; // Spawn just off-screen right
const obstacleDespawnX = viewWidth / -2 - obstacleWidth; // Despawn off-screen left
const obstacleSpeed = 3.0; // World units per second
let timeSinceLastSpawn = 0;
const spawnInterval = 2.0; // Seconds between obstacle spawns

// Obstacle Material
const obstacleMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6600, // Orange color for contrast
    roughness: 0.6,
    metalness: 0.4
});

// --- UI Elements ---
const scoreElement = document.getElementById('score');
const startMessage = document.getElementById('start-message');
const gameOverMessage = document.getElementById('game-over-message');

// --- Game Functions ---

function createObstacle() {
    const gapHeight = THREE.MathUtils.randFloat(obstacleMinGap, obstacleMaxGap);
    const gapCenterY = THREE.MathUtils.randFloat(
        viewHeight / -2 + gapHeight / 2 + 1.0, // Ensure gap isn't too low
        viewHeight / 2 - gapHeight / 2 - 1.0  // Ensure gap isn't too high
    );

    const topHeight = viewHeight / 2 - (gapCenterY + gapHeight / 2);
    const bottomHeight = viewHeight / 2 + (gapCenterY - gapHeight / 2);

    // Ensure heights are not negative (can happen with extreme random values)
    if (topHeight <= 0 || bottomHeight <= 0) return; // Skip creating this obstacle

    const topGeometry = new THREE.BoxGeometry(obstacleWidth, topHeight, obstacleWidth);
    const bottomGeometry = new THREE.BoxGeometry(obstacleWidth, bottomHeight, obstacleWidth);

    // Compute bounding boxes AFTER creation AND potential scaling/positioning
    topGeometry.computeBoundingBox();
    bottomGeometry.computeBoundingBox();

    const topObstacle = new THREE.Mesh(topGeometry, obstacleMaterial.clone());
    const bottomObstacle = new THREE.Mesh(bottomGeometry, obstacleMaterial.clone());

    // Set positions before adding to scene and array
    topObstacle.position.set(
        obstacleSpawnX,
        gapCenterY + gapHeight / 2 + topHeight / 2,
        0
    );
    bottomObstacle.position.set(
        obstacleSpawnX,
        gapCenterY - gapHeight / 2 - bottomHeight / 2,
        0
    );

    // Add to scene
    scene.add(topObstacle);
    scene.add(bottomObstacle);

    // Store obstacle data (including a scoring flag)
    obstacles.push({
        top: topObstacle,
        bottom: bottomObstacle,
        passed: false // Flag for scoring
    });
}

function resetGame() {
    // Reset Seed
    seed.position.y = 0;
    seedVelocityY = 0;
    seed.visible = true; // Make sure seed is visible

    // Reset Score
    score = 0;
    scoreElement.textContent = `Score: ${score}`;

    // Reset Game State
    gameOver = false;
    gameStarted = false; // Require tap to start again
    timeSinceLastSpawn = spawnInterval; // Allow immediate spawn on restart

    // Clear existing obstacles
    obstacles.forEach(obstacle => {
        scene.remove(obstacle.top);
        scene.remove(obstacle.bottom);
        // Optional: Dispose geometry/material if memory becomes an issue
        // obstacle.top.geometry.dispose();
        // obstacle.bottom.geometry.dispose();
    });
    obstacles.length = 0; // Clear the array

    // Reset UI
    gameOverMessage.style.display = 'none';
    startMessage.style.display = 'block';
}

function handleInput() {
    if (gameOver) {
        resetGame();
        return;
    }
    if (!gameStarted) {
        gameStarted = true;
        startMessage.style.display = 'none';
    }
    seedVelocityY = surgeStrength; // Apply the upward boost
}

window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', (event) => {
    event.preventDefault();
    handleInput();
}, { passive: false });

// --- Collision Detection ---
const seedBox = new THREE.Box3();
const obstacleBox = new THREE.Box3();

function checkCollisions() {
    // Update seed's bounding box based on its current world position
    // Get bounding box directly from geometry and apply world matrix
    seedBox.copy(seed.geometry.boundingBox).applyMatrix4(seed.matrixWorld);


    for (const obstacle of obstacles) {
        // Ensure obstacle geometry bounding box exists
         if (!obstacle.top.geometry.boundingBox) obstacle.top.geometry.computeBoundingBox();
         if (!obstacle.bottom.geometry.boundingBox) obstacle.bottom.geometry.computeBoundingBox();

        // Get world bounding box for each obstacle part
        obstacleBox.copy(obstacle.top.geometry.boundingBox).applyMatrix4(obstacle.top.matrixWorld);
        if (seedBox.intersectsBox(obstacleBox)) {
            return true; // Collision detected
        }

        obstacleBox.copy(obstacle.bottom.geometry.boundingBox).applyMatrix4(obstacle.bottom.matrixWorld);
        if (seedBox.intersectsBox(obstacleBox)) {
            return true; // Collision detected
        }
    }
    return false; // No collision
}


// --- Game Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    // --- Game Logic ---
    if (gameStarted && !gameOver) {

        // -- Seed Physics --
        seedVelocityY -= gravity;
        seed.position.y += seedVelocityY;

        // Apply position changes before updating matrix
        seed.updateMatrixWorld(); // Update seed's world matrix for collision detection

        // -- Boundary Checks --
        if (seed.position.y < seedMinY) {
            seed.position.y = seedMinY;
            seedVelocityY = 0;
            gameOver = true;
        } else if (seed.position.y > seedMaxY) {
            seed.position.y = seedMaxY;
            seedVelocityY = 0;
            gameOver = true;
        }

        // -- Obstacle Spawning --
        timeSinceLastSpawn += deltaTime;
        if (timeSinceLastSpawn >= spawnInterval) {
            createObstacle();
            timeSinceLastSpawn = 0; // Reset timer
        }

        // -- Obstacle Movement, Scoring & Cleanup --
        // Iterate backwards for safe removal
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obstacle = obstacles[i];
            // Check if obstacle exists (might have been removed in rare cases)
            if (!obstacle || !obstacle.top || !obstacle.bottom) {
                 obstacles.splice(i, 1); // Clean up invalid entry
                 continue;
            }

            const moveAmount = obstacleSpeed * deltaTime;

            obstacle.top.position.x -= moveAmount;
            obstacle.bottom.position.x -= moveAmount;
            obstacle.top.updateMatrixWorld(); // Update world matrix for collision detection
            obstacle.bottom.updateMatrixWorld();

            // -- Scoring Check --
            // Ensure obstacle exists before checking position
            if (!obstacle.passed && obstacle.top && seed.position.x > obstacle.top.position.x) {
                 obstacle.passed = true;
                 score++;
                 scoreElement.textContent = `Score: ${score}`;
            }


            // -- Cleanup Check --
            // Ensure obstacle exists before checking position
            if (obstacle.top && obstacle.top.position.x < obstacleDespawnX) {
                scene.remove(obstacle.top);
                scene.remove(obstacle.bottom);
                // Optional: Dispose geometry/material
                 if (obstacle.top.geometry) obstacle.top.geometry.dispose();
                 if (obstacle.top.material) obstacle.top.material.dispose();
                 if (obstacle.bottom.geometry) obstacle.bottom.geometry.dispose();
                 if (obstacle.bottom.material) obstacle.bottom.material.dispose();
                obstacles.splice(i, 1); // Remove from array
            }
        }

        // -- Collision Check --
        // Perform collision check only if not already game over
        if (!gameOver && checkCollisions()) {
            gameOver = true;
        }

        // -- Handle Game Over State --
        if (gameOver) {
            gameOverMessage.style.display = 'block';
            seed.visible = false; // Hide seed on game over
        }

        // Seed Rotation (Keep as before)
        // Only rotate if seed is visible
        if (seed.visible) {
             seed.rotation.y += 0.5 * deltaTime;
             seed.rotation.x += 0.3 * deltaTime;
        }

    } else if (gameOver) {
        // Ensure game over message stays visible if game ended
        if (gameOverMessage.style.display !== 'block') {
             gameOverMessage.style.display = 'block';
        }
        if (seed.visible) {
             seed.visible = false;
        }
    } else {
         // Ensure start message stays visible if game not started
         if (startMessage.style.display !== 'block') {
              startMessage.style.display = 'block';
         }
    }


    // --- Rendering ---
    renderer.render(scene, camera);
}

// --- Initial Setup ---
resizeRenderer(); // Call once manually after setup
resetGame(); // Set initial state
animate(); // Start the loop
