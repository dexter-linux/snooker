/**
 * PRO SNOOKER 2026 - Championship Edition
 * Enhanced with detailed marking system and realistic cue mechanics
 */

let balls = [];
let cueBall;
let colors = [];
let pockets = [];
let gameState = 'aiming'; // 'aiming', 'shooting', 'moving', 'foul', 'gameover', 'placingCueBall'
let currentPlayer = 1;
let scores = [0, 0];
let frameScores = [0, 0];
let currentBreak = 0;
let highestBreak = [0, 0];
let totalPoints = [0, 0];
let ballsPottedThisShot = [];
let foulCommitted = false;
let shotHistory = [];
let frameHistory = [];
let currentFrame = 1;

// Shot statistics
let shotStats = {
  player1: { attempts: 0, pots: 0, fouls: 0, safetyAttempts: 0 },
  player2: { attempts: 0, pots: 0, fouls: 0, safetyAttempts: 0 }
};

// Physics Constants
const TABLE_W = 1200;
const TABLE_H = 600;
const BALL_R = 12;
const POCKET_R = 28;
const FRICTION = 0.988;
const ELASTICITY = 0.85;
const SPIN_DECAY = 0.98;

// Cue Stick Physics
let cueStick = {
  angle: 0,
  power: 0,
  isCharging: false,
  maxPower: 25,
  pullBack: 0,
  maxPullBack: 80,
  animationState: 'idle', // 'idle', 'pulling', 'striking', 'recoiling'
  recoilDistance: 0,
  spinOffset: { x: 0, y: 0 }, // For cue ball spin control
  tipPosition: createVector(0, 0)
};

// Visual Effects
let particles = [];
let cameraShake = 0;
let showTrajectory = true;
let lastShotPower = 0;

// Game Logic
let redsRemaining = 15;
let colorsPottedInBreak = [];
let isFreeBall = false;
let respotQueue = [];

function setup() {
  let canvas = createCanvas(TABLE_W + 100, TABLE_H + 200);
  canvas.parent('game-container');
  
  pockets = [
    createVector(40, 40),
    createVector(TABLE_W/2 + 50, 35),
    createVector(TABLE_W + 60, 40),
    createVector(40, TABLE_H + 60),
    createVector(TABLE_W/2 + 50, TABLE_H + 65),
    createVector(TABLE_W + 60, TABLE_H + 60)
  ];
  
  initGame();
}

function draw() {
  push();
  if (cameraShake > 0) {
    translate(random(-cameraShake, cameraShake), random(-cameraShake, cameraShake));
    cameraShake *= 0.9;
    if (cameraShake < 0.5) cameraShake = 0;
  }
  
  drawTable();
  
  // Game state machine
  switch(gameState) {
    case 'aiming':
    case 'placingCueBall':
      updateAiming();
      drawTrajectory();
      drawGhostBall();
      drawCueStick();
      break;
    case 'shooting':
      updateCueAnimation();
      drawCueStick();
      break;
    case 'moving':
      updatePhysics();
      break;
  }
  
  // Render balls
  for (let ball of balls) {
    ball.show();
  }
  
  updateParticles();
  drawUI();
  
  // Draw power meter when charging
  if (cueStick.isCharging) {
    drawPowerMeter();
  }
  
  pop();
}

// ────────────────────────────────────────────────
// CUE STICK SYSTEM
// ────────────────────────────────────────────────

function updateAiming() {
  if (gameState === 'placingCueBall') return;
  
  // Calculate angle from cue ball to mouse
  let dx = mouseX - cueBall.pos.x;
  let dy = mouseY - cueBall.pos.y;
  cueStick.angle = atan2(dy, dx);
  
  // Calculate spin offset based on mouse position relative to cue ball center
  if (cueStick.isCharging) {
    let dist = dist(mouseX, mouseY, cueBall.pos.x, cueBall.pos.y);
    let maxDist = 100;
    if (dist > 0) {
      let spinX = map(mouseX - cueBall.pos.x, -maxDist, maxDist, -1, 1, true);
      let spinY = map(mouseY - cueBall.pos.y, -maxDist, maxDist, -1, 1, true);
      cueStick.spinOffset = { x: spinX, y: spinY };
    }
  }
}

function updateCueAnimation() {
  switch(cueStick.animationState) {
    case 'pulling':
      if (cueStick.isCharging) {
        let targetPull = map(cueStick.power, 0, cueStick.maxPower, 0, cueStick.maxPullBack);
        cueStick.pullBack = lerp(cueStick.pullBack, targetPull, 0.2);
      }
      break;
      
    case 'striking':
      // Rapid forward movement
      cueStick.pullBack = lerp(cueStick.pullBack, -20, 0.4);
      if (cueStick.pullBack <= 0) {
        // Make contact
        executeShot();
        cueStick.animationState = 'recoiling';
      }
      break;
      
    case 'recoiling':
      cueStick.pullBack = lerp(cueStick.pullBack, cueStick.maxPullBack * 0.3, 0.1);
      if (abs(cueStick.pullBack - cueStick.maxPullBack * 0.3) < 1) {
        cueStick.animationState = 'idle';
        gameState = 'moving';
      }
      break;
  }
}

function drawCueStick() {
  if (cueBall.potted && gameState !== 'placingCueBall') return;
  
  push();
  translate(cueBall.pos.x, cueBall.pos.y);
  rotate(cueStick.angle);
  
  // Calculate cue position based on animation state
  let cueDistance = -60 - cueStick.pullBack;
  if (cueStick.animationState === 'striking') {
    cueDistance += cueStick.recoilDistance;
  }
  
  translate(cueDistance, 0);
  
  // Cue shadow
  push();
  translate(5, 5);
  rotate(0.02);
  drawCueShaft(0.3);
  pop();
  
  // Main cue
  drawCueShaft(1);
  
  // Spin indicator (shows where tip hits)
  if (cueStick.isCharging || gameState === 'aiming') {
    drawSpinIndicator();
  }
  
  pop();
}

function drawCueShaft(alpha) {
  let cueLength = 350;
  let tipLength = 15;
  let buttLength = 40;
  
  // Tip
  noStroke();
  fill(139, 69, 19, 255 * alpha);
  rect(0, -4, tipLength, 8, 2);
  
  // Ferrule
  fill(240, 240, 240, 255 * alpha);
  rect(tipLength, -3.5, 8, 7);
  
  // Shaft gradient
  for (let i = 0; i < cueLength - buttLength; i++) {
    let inter = map(i, 0, cueLength - buttLength, 0, 1);
    let c = lerpColor(
      color(222, 184, 135, 255 * alpha),
      color(200, 150, 100, 255 * alpha),
      inter
    );
    stroke(c);
    strokeWeight(map(i, 0, cueLength - buttLength, 8, 10));
    line(tipLength + 8 + i, 0, tipLength + 8 + i + 1, 0);
  }
  
  // Joint collar
  fill(100, 100, 100, 255 * alpha);
  noStroke();
  rect(cueLength - buttLength, -5, 8, 10);
  
  // Butt
  fill(101, 67, 33, 255 * alpha);
  rect(cueLength - buttLength + 8, -6, buttLength - 8, 12, 3);
  
  // Butt cap
  fill(60, 40, 20, 255 * alpha);
  rect(cueLength - 5, -5, 5, 10, 2);
}

function drawSpinIndicator() {
  // Draw cue ball with spin marker
  push();
  translate(-60, 0);
  
  // Ghost cue ball
  noFill();
  stroke(255, 100);
  strokeWeight(2);
  ellipse(0, 0, BALL_R * 2);
  
  // Spin point
  let spinX = cueStick.spinOffset.x * BALL_R * 0.7;
  let spinY = cueStick.spinOffset.y * BALL_R * 0.7;
  
  fill(255, 0, 0, 200);
  noStroke();
  ellipse(spinX, spinY, 6);
  
  // Line to show spin direction
  stroke(255, 0, 0, 150);
  strokeWeight(2);
  line(0, 0, spinX * 1.5, spinY * 1.5);
  
  pop();
}

// ────────────────────────────────────────────────
// PHYSICS & GAME LOGIC
// ────────────────────────────────────────────────

function updatePhysics() {
  let anyMoving = false;
  let movingBalls = [];
  
  for (let ball of balls) {
    if (ball.potted) continue;
    
    ball.update();
    
    // Track movement
    if (ball.vel.mag() > 0.01) {
      anyMoving = true;
      movingBalls.push(ball);
    }
    
    // Check pockets
    if (ball.checkPocket()) {
      handleBallPotted(ball);
    }
    
    // Collisions
    for (let other of balls) {
      if (ball !== other && !other.potted) {
        ball.checkCollision(other);
      }
    }
  }
  
  if (!anyMoving && gameState === 'moving') {
    setTimeout(endShot, 500);
  }
}

function handleBallPotted(ball) {
  if (ball.potted) return;
  
  ball.potted = true;
  ball.vel.set(0, 0);
  ballsPottedThisShot.push(ball);
  
  // Visual effects
  createSplashParticles(ball.pos.x, ball.pos.y, ball.color);
  cameraShake = 2;
  
  // Scoring logic
  if (ball === cueBall) {
    foulCommitted = true;
    shotStats[`player${currentPlayer}`].fouls++;
  } else {
    shotStats[`player${currentPlayer}`].pots++;
    let points = ball.value;
    
    // Check if valid pot
    let isValid = validatePot(ball);
    
    if (isValid) {
      scores[currentPlayer - 1] += points;
      currentBreak += points;
      totalPoints[currentPlayer - 1] += points;
      colorsPottedInBreak.push(ball);
      
      // Update highest break
      if (currentBreak > highestBreak[currentPlayer - 1]) {
        highestBreak[currentPlayer - 1] = currentBreak;
      }
      
      // Queue respot if color and reds remain
      if (!ball.isRed && redsRemaining > 0) {
        respotQueue.push(ball);
      }
      
      // Decrement reds count
      if (ball.isRed) {
        redsRemaining--;
      }
    } else {
      foulCommitted = true;
      scores[currentPlayer - 1] -= 4; // Minimum foul
      shotStats[`player${currentPlayer}`].fouls++;
    }
  }
}

function validatePot(ball) {
  // Simplified validation - in full snooker this checks alternation between red and color
  if (redsRemaining > 0) {
    // Must pot red first, then color alternately
    let lastPotted = colorsPottedInBreak[colorsPottedInBreak.length - 1];
    if (!lastPotted) {
      return ball.isRed; // First pot must be red
    } else {
      return ball.isRed !== lastPotted.isRed; // Must alternate
    }
  }
  // Final sequence: colors in order
  return true;
}

function executeShot() {
  let force = p5.Vector.fromAngle(cueStick.angle).mult(cueStick.power * 0.8);
  cueBall.vel.set(force);
  
  // Apply spin
  cueBall.spin.x = cueStick.spinOffset.x * cueStick.power * 0.1;
  cueBall.spin.y = cueStick.spinOffset.y * cueStick.power * 0.1;
  
  cameraShake = cueStick.power * 0.2;
  lastShotPower = cueStick.power;
  
  shotStats[`player${currentPlayer}`].attempts++;
}

function endShot() {
  // Process respots
  for (let ball of respotQueue) {
    ball.potted = false;
    ball.pos.set(ball.initialPos.x, ball.initialPos.y);
    ball.vel.set(0, 0);
  }
  respotQueue = [];
  
  // Determine next state
  if (redsRemaining === 0 && colorsRemaining() === 0) {
    endFrame();
    return;
  }
  
  if (foulCommitted || ballsPottedThisShot.length === 0) {
    // End of turn
    if (currentBreak > 0) {
      shotHistory.push({
        player: currentPlayer,
        break: currentBreak,
        foul: foulCommitted
      });
    }
    
    if (foulCommitted) {
      // Award points to opponent
      let foulValue = 4;
      if (ballsPottedThisShot.length > 0 && !ballsPottedThisShot[0].isRed) {
        foulValue = max(4, ballsPottedThisShot[0].value);
      }
      scores[currentPlayer === 1 ? 1 : 0] += foulValue;
    }
    
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    currentBreak = 0;
    colorsPottedInBreak = [];
  }
  
  // Reset cue ball if potted
  if (cueBall.potted) {
    cueBall.potted = false;
    cueBall.pos.set(60 + TABLE_W * 0.18, 60 + TABLE_H * 0.5);
    cueBall.vel.set(0, 0);
    cueBall.spin.set(0, 0);
  }
  
  ballsPottedThisShot = [];
  foulCommitted = false;
  cueStick.power = 0;
  cueStick.pullBack = 0;
  gameState = 'aiming';
}

function colorsRemaining() {
  return balls.filter(b => !b.isRed && b !== cueBall && !b.potted).length;
}

function endFrame() {
  gameState = 'gameover';
  
  // Determine winner
  let winner = scores[0] > scores[1] ? 1 : 2;
  frameScores[winner - 1]++;
  
  frameHistory.push({
    frame: currentFrame,
    winner: winner,
    score: [scores[0], scores[1]],
    highestBreak: [highestBreak[0], highestBreak[1]]
  });
  
  currentFrame++;
}

// ────────────────────────────────────────────────
// BALL CLASS
// ────────────────────────────────────────────────

class Ball {
  constructor(x, y, col, val, isRed = false, name = '') {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.color = col;
    this.value = val;
    this.isRed = isRed;
    this.name = name;
    this.potted = false;
    this.initialPos = createVector(x, y);
    this.spin = createVector(0, 0);
    this.mass = 1;
  }

  update() {
    if (this.potted) return;
    
    // Apply spin effect
    this.vel.x += this.spin.x * 0.02;
    this.vel.y += this.spin.y * 0.02;
    
    // Update position
    this.pos.add(this.vel);
    
    // Friction
    this.vel.mult(FRICTION);
    this.spin.mult(SPIN_DECAY);
    
    // Stop threshold
    if (this.vel.mag() < 0.03) {
      this.vel.set(0, 0);
      this.spin.set(0, 0);
    }
    
    // Table boundaries
    this.checkCushions();
  }
  
  checkCushions() {
    let left = 60, right = TABLE_W + 40;
    let top = 60, bottom = TABLE_H + 40;
    let pocketWidth = 60;
    let centerX = TABLE_W/2 + 50;
    
    // Side cushions
    if (this.pos.x < left + BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = left + BALL_R;
      this.applyCushionSpin('vertical');
    } else if (this.pos.x > right - BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = right - BALL_R;
      this.applyCushionSpin('vertical');
    }
    
    // Top/Bottom cushions (skip pocket areas)
    let inPocketX = abs(this.pos.x - centerX) < pocketWidth/2;
    
    if (this.pos.y < top + BALL_R && !inPocketX) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = top + BALL_R;
      this.applyCushionSpin('horizontal');
    } else if (this.pos.y > bottom - BALL_R && !inPocketX) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = bottom - BALL_R;
      this.applyCushionSpin('horizontal');
    }
  }
  
  applyCushionSpin(direction) {
    // Convert side spin to roll after cushion hit
    if (direction === 'vertical') {
      this.vel.y += this.spin.y * 0.5;
      this.spin.y *= 0.5;
    } else {
      this.vel.x += this.spin.x * 0.5;
      this.spin.x *= 0.5;
    }
    this.vel.mult(0.95);
  }

  show() {
    if (this.potted) return;
    
    push();
    translate(this.pos.x, this.pos.y);
    
    // Shadow
    noStroke();
    fill(0, 80);
    ellipse(4, 4, BALL_R * 2);
    
    // Ball body with 3D effect
    let grad = drawingContext.createRadialGradient(
      -BALL_R*0.3, -BALL_R*0.3, 2,
      0, 0, BALL_R
    );
    
    let baseColor = color(this.color);
    grad.addColorStop(0, lighten(this.color, 50));
    grad.addColorStop(0.4, this.color);
    grad.addColorStop(1, darken(this.color, 60));
    
    drawingContext.fillStyle = grad;
    ellipse(0, 0, BALL_R * 2);
    
    // Shine reflection
    fill(255, 180);
    ellipse(-BALL_R*0.4, -BALL_R*0.4, BALL_R * 0.5);
    
    // Value number for colors
    if (!this.isRed && this.value > 0) {
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(10);
      textStyle(BOLD);
      stroke(0);
      strokeWeight(1);
      text(this.value, 0, 0);
    }
    
    pop();
  }

  checkCollision(other) {
    let d = p5.Vector.dist(this.pos, other.pos);
    let minD = BALL_R * 2;
    
    if (d < minD && d > 0.1) {
      // Resolve overlap
      let n = p5.Vector.sub(this.pos, other.pos).normalize();
      let overlap = minD - d;
      this.pos.add(n.copy().mult(overlap * 0.5));
      other.pos.sub(n.copy().mult(overlap * 0.5));
      
      // Collision physics
      let relVel = p5.Vector.sub(this.vel, other.vel);
      let speed = relVel.dot(n);
      
      if (speed < 0) {
        // Elastic collision with mass consideration
        let totalMass = this.mass + other.mass;
        let impulse = 2 * speed / totalMass;
        
        let impulseVec = n.copy().mult(impulse * 0.9); // 0.9 for slight energy loss
        
        this.vel.sub(impulseVec.copy().mult(other.mass));
        other.vel.add(impulseVec.copy().mult(this.mass));
        
        // Spin transfer
        let spinTransfer = this.spin.copy().mult(0.2);
        other.spin.add(spinTransfer);
        this.spin.sub(spinTransfer);
        
        // Visual feedback
        createCollisionParticles(
          (this.pos.x + other.pos.x) / 2,
          (this.pos.y + other.pos.y) / 2,
          this.color
        );
      }
      
      return true;
    }
    return false;
  }

  checkPocket() {
    for (let p of pockets) {
      if (this.pos.dist(p) < POCKET_R - 8) {
        return true;
      }
    }
    return false;
  }
}

// ────────────────────────────────────────────────
// VISUAL EFFECTS
// ────────────────────────────────────────────────

class Particle {
  constructor(x, y, col, type = 'spark') {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(1, 4));
    this.color = col;
    this.life = 255;
    this.type = type;
    this.size = random(2, 6);
    this.gravity = type === 'dust' ? 0.1 : 0;
  }
  
  update() {
    this.vel.mult(0.95);
    this.vel.y += this.gravity;
    this.pos.add(this.vel);
    this.life -= type === 'dust' ? 3 : 8;
  }
  
  show() {
    noStroke();
    let c = color(this.color);
    c.setAlpha(this.life);
    fill(c);
    
    if (this.type === 'spark') {
      ellipse(this.pos.x, this.pos.y, this.size);
    } else {
      rect(this.pos.x, this.pos.y, this.size, this.size);
    }
  }
}

function createCollisionParticles(x, y, col) {
  for (let i = 0; i < 5; i++) {
    particles.push(new Particle(x, y, col, 'spark'));
  }
}

function createSplashParticles(x, y, col) {
  for (let i = 0; i < 15; i++) {
    particles.push(new Particle(x, y, col, 'dust'));
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].show();
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ────────────────────────────────────────────────
// RENDERING
// ────────────────────────────────────────────────

function drawTable() {
  // Background
  background(25, 25, 35);
  
  // Wood frame with gradient
  let frameGrad = drawingContext.createLinearGradient(0, 0, 0, height);
  frameGrad.addColorStop(0, '#8B4513');
  frameGrad.addColorStop(0.5, '#A0522D');
  frameGrad.addColorStop(1, '#8B4513');
  drawingContext.fillStyle = frameGrad;
  
  fill(101, 67, 33);
  stroke(60, 40, 20);
  strokeWeight(4);
  rect(20, 20, TABLE_W + 80, TABLE_H + 80, 15);
  
  // Cushion nap
  fill(20, 100, 40);
  noStroke();
  rect(50, 50, TABLE_W + 20, TABLE_H + 20);
  
  // Playing surface
  let baizeGrad = drawingContext.createRadialGradient(
    width/2, height/2, 100,
    width/2, height/2, 600
  );
  baizeGrad.addColorStop(0, '#2d8a4e');
  baizeGrad.addColorStop(1, '#1e6b3a');
  drawingContext.fillStyle = baizeGrad;
  
  rect(60, 60, TABLE_W, TABLE_H);
  
  // Markings
  drawMarkings();
  
  // Pockets
  drawPockets();
}

function drawMarkings() {
  stroke(255, 220);
  strokeWeight(2);
  noFill();
  
  let offsetX = 60;
  let offsetY = 60;
  
  // Baulk line
  let baulkX = offsetX + TABLE_W * 0.22;
  line(baulkX, offsetY, baulkX, offsetY + TABLE_H);
  
  // The D
  let dRadius = 120;
  arc(baulkX, offsetY + TABLE_H/2, dRadius, dRadius, HALF_PI, -HALF_PI);
  
  // Spots
  fill(255, 150);
  noStroke();
  
  // Colored spots
  ellipse(baulkX, offsetY + TABLE_H/2, 8); // Brown
  ellipse(baulkX, offsetY + TABLE_H * 0.35, 8); // Green
  ellipse(baulkX, offsetY + TABLE_H * 0.65, 8); // Yellow
  ellipse(offsetX + TABLE_W/2, offsetY + TABLE_H/2, 8); // Blue
  ellipse(offsetX + TABLE_W * 0.75, offsetY + TABLE_H/2, 8); // Pink
  ellipse(offsetX + TABLE_W * 0.88, offsetY + TABLE_H/2, 8); // Black
  ellipse(offsetX + TABLE_W * 0.77, offsetY + TABLE_H/2, 6); // Pyramid
}

function drawPockets() {
  for (let p of pockets) {
    // Pocket depth
    fill(10);
    noStroke();
    ellipse(p.x, p.y, POCKET_R * 2);
    
    // Pocket rim
    noFill();
    stroke(80, 60, 40);
    strokeWeight(4);
    ellipse(p.x, p.y, POCKET_R * 2 - 2);
    
    // Inner shadow
    fill(0, 100);
    ellipse(p.x + 3, p.y + 3, POCKET_R * 1.5);
  }
}

function drawTrajectory() {
  if (!showTrajectory || gameState !== 'aiming') return;
  
  let start = cueBall.pos.copy();
  let dir = p5.Vector.fromAngle(cueStick.angle);
  
  // Cast ray to find collision
  let steps = 50;
  let stepSize = 20;
  let current = start.copy();
  let trajectory = [start.copy()];
  
  for (let i = 0; i < steps; i++) {
    current.add(dir.copy().mult(stepSize));
    
    // Check wall collision
    if (current.x < 60 + BALL_R || current.x > TABLE_W + 40 - BALL_R) {
      dir.x *= -1;
      trajectory.push(current.copy());
    }
    if (current.y < 60 + BALL_R || current.y > TABLE_H + 60 - BALL_R) {
      // Check if in pocket zone
      let inPocket = abs(current.x - (TABLE_W/2 + 50)) < 40;
      if (!inPocket) {
        dir.y *= -1;
        trajectory.push(current.copy());
      }
    }
    
    // Check ball collision
    let hit = false;
    for (let b of balls) {
      if (b !== cueBall && !b.potted && current.dist(b.pos) < BALL_R * 2) {
        trajectory.push(b.pos.copy());
        hit = true;
        break;
      }
    }
    
    if (hit) break;
    if (trajectory.length > 10) break;
  }
  
  // Draw trajectory line
  noFill();
  strokeWeight(2);
  
  for (let i = 0; i < trajectory.length - 1; i++) {
    let alpha = map(i, 0, trajectory.length, 200, 50);
    stroke(255, 255, 255, alpha);
    
    if (i === 0) {
      setLineDash([10, 10]);
    } else {
      setLineDash([]);
    }
    
    line(trajectory[i].x, trajectory[i].y, trajectory[i+1].x, trajectory[i+1].y);
  }
  setLineDash([]);
}

function drawGhostBall() {
  if (gameState !== 'aiming') return;
  
  // Calculate ghost ball position
  let mousePos = createVector(mouseX, mouseY);
  let dir = p5.Vector.sub(mousePos, cueBall.pos);
  let dist = dir.mag();
  dir.normalize();
  
  // Limit distance
  if (dist > 300) dist = 300;
  
  let ghostPos = p5.Vector.add(cueBall.pos, dir.mult(dist));
  
  // Check collision with other balls
  let valid = true;
  for (let b of balls) {
    if (b !== cueBall && !b.potted && ghostPos.dist(b.pos) < BALL_R * 2) {
      valid = false;
      break;
    }
  }
  
  // Draw ghost ball
  noFill();
  stroke(valid ? 255 : 255, 0, 0, 150);
  strokeWeight(2);
  ellipse(ghostPos.x, ghostPos.y, BALL_R * 2);
  
  // Contact point indicator
  let contactDir = p5.Vector.sub(cueBall.pos, ghostPos).normalize();
  let contactPoint = p5.Vector.add(ghostPos, contactDir.mult(BALL_R));
  
  fill(valid ? 0 : 255, valid ? 255 : 0, 0, 200);
  noStroke();
  ellipse(contactPoint.x, contactPoint.y, 8);
}

function drawPowerMeter() {
  push();
  translate(cueBall.pos.x, cueBall.pos.y - 50);
  
  // Background
  fill(0, 150);
  rect(-60, 0, 120, 12, 6);
  
  // Fill gradient
  let pct = cueStick.power / cueStick.maxPower;
  let r = map(pct, 0, 1, 100, 255);
  let g = map(pct, 0, 1, 255, 50);
  
  let powerGrad = drawingContext.createLinearGradient(-60, 0, 60, 0);
  powerGrad.addColorStop(0, `rgb(${r}, ${g}, 50)`);
  powerGrad.addColorStop(1, `rgb(255, 50, 50)`);
  drawingContext.fillStyle = powerGrad;
  
  rect(-60, 0, 120 * pct, 12, 6);
  
  // Percentage text
  fill(255);
  textAlign(CENTER);
  textSize(12);
  textStyle(BOLD);
  text(int(pct * 100) + "%", 0, -5);
  
  pop();
}

function setLineDash(list) {
  drawingContext.setLineDash(list);
}

// ────────────────────────────────────────────────
// UI & SCORING
// ────────────────────────────────────────────────

function drawUI() {
  // Main panel background
  fill(20, 20, 25, 240);
  noStroke();
  rect(0, TABLE_H + 100, width, 100);
  
  // Player panels
  drawPlayerPanel(1, 30, TABLE_H + 110);
  drawPlayerPanel(2, width/2 + 30, TABLE_H + 110);
  
  // Center info
  drawCenterInfo();
  
  // Bottom instructions
  if (gameState === 'aiming') {
    fill(255, 255, 255, 200);
    textAlign(CENTER);
    textSize(14);
    text("HOLD MOUSE TO CHARGE • MOVE MOUSE TO AIM • RELEASE TO SHOOT", width/2, 30);
  }
}

function drawPlayerPanel(player, x, y) {
  let isActive = currentPlayer === player;
  let idx = player - 1;
  
  // Panel background
  if (isActive) {
    fill(40, 60, 40);
    stroke(100, 200, 100);
    strokeWeight(2);
  } else {
    fill(30, 30, 35);
    noStroke();
  }
  rect(x, y, width/2 - 60, 80, 10);
  
  // Player name
  fill(isActive ? '#4CAF50' : '#888');
  textAlign(LEFT);
  textSize(20);
  textStyle(BOLD);
  text(`PLAYER ${player}`, x + 15, y + 25);
  
  // Score
  fill(255);
  textSize(32);
  text(scores[idx], x + 15, y + 60);
  
  // Stats
  fill(200);
  textSize(11);
  text(`Frames: ${frameScores[idx]}`, x + 120, y + 20);
  text(`High Break: ${highestBreak[idx]}`, x + 120, y + 35);
  text(`Total Pts: ${totalPoints[idx]}`, x + 120, y + 50);
  text(`Pots: ${shotStats[`player${player}`].pots}`, x + 120, y + 65);
  
  // Current break indicator
  if (isActive && currentBreak > 0) {
    fill(255, 215, 0);
    textSize(14);
    text(`BREAK: ${currentBreak}`, x + 220, y + 40);
  }
}

function drawCenterInfo() {
  let centerX = width/2;
  let y = TABLE_H + 110;
  
  // Frame info
  fill(150);
  textAlign(CENTER);
  textSize(12);
  text(`FRAME ${currentFrame}`, centerX, y + 15);
  
  // Reds remaining
  fill(220, 50, 50);
  textSize(14);
  text(`REDS: ${redsRemaining}`, centerX, y + 35);
  
  // Foul indicator
  if (foulCommitted) {
    fill(255, 0, 0);
    textSize(16);
    textStyle(BOLD);
    text("FOUL!", centerX, y + 60);
  }
  
  // Last shot power
  if (lastShotPower > 0) {
    fill(100, 200, 255);
    textSize(11);
    text(`Last: ${int(lastShotPower/25*100)}%`, centerX, y + 75);
  }
}

// ────────────────────────────────────────────────
// INPUT HANDLING
// ────────────────────────────────────────────────

function mousePressed() {
  if (gameState === 'aiming' && !cueBall.potted) {
    cueStick.isCharging = true;
    cueStick.animationState = 'pulling';
    cueStick.power = 0;
  } else if (gameState === 'placingCueBall') {
    // Place cue ball in D area
    let dCenterX = 60 + TABLE_W * 0.22;
    let dCenterY = 60 + TABLE_H/2;
    let dRadius = 60;
    
    let mousePos = createVector(mouseX, mouseY);
    let dCenter = createVector(dCenterX, dCenterY);
    
    if (mousePos.dist(dCenter) < dRadius && mousePos.x <= dCenterX) {
      cueBall.pos.set(mouseX, mouseY);
      gameState = 'aiming';
    }
  }
}

function mouseReleased() {
  if (cueStick.isCharging && gameState === 'aiming') {
    cueStick.isCharging = false;
    cueStick.animationState = 'striking';
    gameState = 'shooting';
  }
}

function mouseDragged() {
  if (cueStick.isCharging) {
    cueStick.power = min(cueStick.power + 0.4, cueStick.maxPower);
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    initGame();
  } else if (key === 't' || key === 'T') {
    showTrajectory = !showTrajectory;
  } else if (key === ' ' && gameState === 'gameover') {
    initGame();
  }
}

// ────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────

function initGame() {
  balls = [];
  gameState = 'aiming';
  currentPlayer = 1;
  scores = [0, 0];
  currentBreak = 0;
  redsRemaining = 15;
  colorsPottedInBreak = [];
  ballsPottedThisShot = [];
  foulCommitted = false;
  respotQueue = [];
  lastShotPower = 0;
  
  // Reset cue stick
  cueStick.power = 0;
  cueStick.pullBack = 0;
  cueStick.isCharging = false;
  cueStick.animationState = 'idle';
  
  // Cue Ball
  cueBall = new Ball(60 + TABLE_W * 0.18, 60 + TABLE_H * 0.5, '#ffffff', 0, false, 'Cue');
  balls.push(cueBall);
  
  // Colors
  let baulkX = 60 + TABLE_W * 0.22;
  colors = [
    new Ball(baulkX, 60 + TABLE_H * 0.65, '#ffdd00', 2, false, 'Yellow'),
    new Ball(baulkX, 60 + TABLE_H * 0.5, '#8B4513', 4, false, 'Brown'),
    new Ball(baulkX, 60 + TABLE_H * 0.35, '#228B22', 3, false, 'Green'),
    new Ball(60 + TABLE_W * 0.5, 60 + TABLE_H * 0.5, '#0000ff', 5, false, 'Blue'),
    new Ball(60 + TABLE_W * 0.75, 60 + TABLE_H * 0.5, '#ff69b4', 6, false, 'Pink'),
    new Ball(60 + TABLE_W * 0.88, 60 + TABLE_H * 0.5, '#111111', 7, false, 'Black')
  ];
  balls.push(...colors);
  
  // Reds (full triangle)
  let startX = 60 + TABLE_W * 0.77;
  let startY = 60 + TABLE_H * 0.5;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      let x = startX + (row * BALL_R * 1.8);
      let y = startY - (row * BALL_R) + (col * BALL_R * 2);
      balls.push(new Ball(x, y, '#dc143c', 1, true, 'Red'));
    }
  }
}

// ────────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────────

function lighten(col, amt) {
  let c = color(col);
  return color(min(255, red(c) + amt), min(255, green(c) + amt), min(255, blue(c) + amt));
}

function darken(col, amt) {
  let c = color(col);
  return color(max(0, red(c) - amt), max(0, green(c) - amt), max(0, blue(c) - amt));
}
