/**
 * PRO SNOOKER 2026 - Enhanced Edition
 * Controls: 
 * - Mouse Move: Aim (See Ghost Ball + Trajectory)
 * - Mouse Hold: Charge Power Meter
 * - Release: Shoot
 * - R: Reset Game
 */

let balls = [];
let cueBall;
let colors = [];
let pockets = [];
let gameState = 'aiming'; // 'aiming', 'shooting', 'moving', 'foul', 'gameover'
let currentPlayer = 1;
let scores = [0, 0];
let frameScores = [0, 0];
let breakScore = 0;
let currentBreak = 0;
let ballsPottedThisShot = [];
let foulCommitted = false;
let shotHistory = [];

// Physics Constants
const TABLE_W = 1200;
const TABLE_H = 600;
const BALL_R = 12;
const POCKET_R = 28;
const FRICTION = 0.988;
const ELASTICITY = 0.85;
const SPIN_DECAY = 0.98;

// Interaction State
let cueAngle = 0;
let charge = 0;
let isCharging = false;
let maxCharge = 30;
let cueStickOffset = 0;
let cameraShake = 0;

// Visual Effects
let particles = [];
let trajectoryBounces = [];

function setup() {
  let canvas = createCanvas(TABLE_W + 100, TABLE_H + 150);
  canvas.parent('game-container');
  
  // Define pockets with proper snooker positions
  pockets = [
    createVector(40, 40),           // Top Left
    createVector(TABLE_W/2 + 50, 35), // Top Middle
    createVector(TABLE_W + 60, 40),   // Top Right
    createVector(40, TABLE_H + 60),   // Bottom Left
    createVector(TABLE_W/2 + 50, TABLE_H + 65), // Bottom Middle
    createVector(TABLE_W + 60, TABLE_H + 60)    // Bottom Right
  ];
  
  initGame();
}

function draw() {
  // Apply camera shake
  push();
  if (cameraShake > 0) {
    translate(random(-cameraShake, cameraShake), random(-cameraShake, cameraShake));
    cameraShake *= 0.9;
    if (cameraShake < 0.5) cameraShake = 0;
  }
  
  drawTable();
  
  // Update game state
  if (gameState === 'moving') {
    updatePhysics();
    checkBallsStopped();
  }
  
  // Draw balls
  for (let ball of balls) {
    ball.show();
  }
  
  // Draw particles
  updateParticles();
  
  // Draw aiming aids when appropriate
  if (gameState === 'aiming' && !isCharging) {
    drawTrajectory();
    drawGhostBall();
  }
  
  if (gameState === 'aiming' || gameState === 'shooting') {
    drawCueStick();
  }
  
  if (isCharging) {
    drawPowerMeter();
  }
  
  drawUI();
  pop();
}

// ────────────────────────────────────────────────
// PHYSICS ENGINE
// ────────────────────────────────────────────────

function updatePhysics() {
  let anyMoving = false;
  
  for (let i = 0; i < balls.length; i++) {
    let b = balls[i];
    if (b.potted) continue;
    
    b.update();
    
    // Check pockets
    if (b.checkPocket()) {
      handleBallPotted(b);
    }
    
    // Ball-ball collisions
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[j].potted) {
        if (b.checkCollision(balls[j])) {
          createCollisionParticles(b.pos.x, b.pos.y, b.color);
        }
      }
    }
    
    if (b.vel.mag() > 0.01) anyMoving = true;
  }
  
  if (!anyMoving && gameState === 'moving') {
    endShot();
  }
}

function handleBallPotted(ball) {
  ball.potted = true;
  ball.vel.set(0, 0);
  ballsPottedThisShot.push(ball);
  
  // Create splash effect
  for (let i = 0; i < 10; i++) {
    particles.push(new Particle(ball.pos.x, ball.pos.y, ball.color));
  }
  
  if (ball === cueBall) {
    foulCommitted = true;
    // Cue ball will be respotted after shot ends
  } else {
    currentBreak += ball.value;
    
    // Check if color needs respotting
    if (!ball.isRed && redsRemaining() > 0) {
      setTimeout(() => respotColor(ball), 100);
    }
  }
}

function respotColor(ball) {
  ball.potted = false;
  ball.pos.set(ball.initialPos.x, ball.initialPos.y);
  ball.vel.set(0, 0);
}

function redsRemaining() {
  return balls.filter(b => b.isRed && !b.potted).length;
}

function checkBallsStopped() {
  // Handled in updatePhysics
}

function endShot() {
  gameState = 'aiming';
  
  // Process shot results
  if (foulCommitted || ballsPottedThisShot.length === 0) {
    // Foul or miss - switch players
    if (foulCommitted) {
      let penalty = 4;
      if (ballsPottedThisShot.length > 0 && !ballsPottedThisShot[0].isRed) {
        penalty = max(4, ballsPottedThisShot[0].value);
      }
      scores[currentPlayer - 1] -= penalty;
      shotHistory.push(`P${currentPlayer}: Foul (-${penalty})`);
    } else {
      shotHistory.push(`P${currentPlayer}: Miss`);
    }
    
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    currentBreak = 0;
  } else {
    // Valid pot - continue break
    shotHistory.push(`P${currentPlayer}: +${currentBreak}`);
  }
  
  // Check for frame end
  if (redsRemaining() === 0 && colorsRemaining() === 0) {
    endFrame();
  }
  
  // Respot cue ball if potted
  if (cueBall.potted) {
    cueBall.potted = false;
    cueBall.pos.set(TABLE_W * 0.2, TABLE_H * 0.5);
    cueBall.vel.set(0, 0);
  }
  
  ballsPottedThisShot = [];
  foulCommitted = false;
}

function colorsRemaining() {
  return balls.filter(b => !b.isRed && b !== cueBall && b.potted === false).length;
}

function endFrame() {
  gameState = 'gameover';
  if (scores[0] > scores[1]) frameScores[0]++;
  else if (scores[1] > scores[0]) frameScores[1]++;
}

// ────────────────────────────────────────────────
// BALL CLASS
// ────────────────────────────────────────────────

class Ball {
  constructor(x, y, col, val, isRed = false, name = '') {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.color = col;
    this.value = val;
    this.isRed = isRed;
    this.name = name;
    this.potted = false;
    this.initialPos = createVector(x, y);
    this.spin = createVector(0, 0);
  }

  update() {
    if (this.potted) return;
    
    // Apply velocity
    this.pos.add(this.vel);
    
    // Apply friction
    this.vel.mult(FRICTION);
    this.spin.mult(SPIN_DECAY);
    
    // Stop if very slow
    if (this.vel.mag() < 0.05) {
      this.vel.set(0, 0);
      this.spin.set(0, 0);
    }
    
    // Apply spin effect (simplified)
    this.vel.add(this.spin.copy().mult(0.01));
    
    // Table boundaries (cushions)
    let left = 60, right = TABLE_W + 40;
    let top = 60, bottom = TABLE_H + 40;
    
    // Side cushions
    if (this.pos.x < left + BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = left + BALL_R;
      this.applyCushionFriction();
    } else if (this.pos.x > right - BALL_R) {
      this.vel.x *= -ELASTICITY;
      this.pos.x = right - BALL_R;
      this.applyCushionFriction();
    }
    
    // Top/bottom cushions (accounting for pockets)
    let inPocketZone = (this.pos.x > TABLE_W/2 + 20 && this.pos.x < TABLE_W/2 + 80);
    
    if (this.pos.y < top + BALL_R && !inPocketZone) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = top + BALL_R;
      this.applyCushionFriction();
    } else if (this.pos.y > bottom - BALL_R && !inPocketZone) {
      this.vel.y *= -ELASTICITY;
      this.pos.y = bottom - BALL_R;
      this.applyCushionFriction();
    }
  }
  
  applyCushionFriction() {
    this.vel.mult(0.98); // Extra friction on cushion hit
  }

  show() {
    if (this.potted) return;
    
    push();
    translate(this.pos.x, this.pos.y);
    
    // Shadow
    noStroke();
    fill(0, 60);
    ellipse(3, 3, BALL_R * 2);
    
    // Ball body with gradient effect
    let grad = drawingContext.createRadialGradient(-3, -3, 2, 0, 0, BALL_R);
    grad.addColorStop(0, lighten(this.color, 40));
    grad.addColorStop(0.3, this.color);
    grad.addColorStop(1, darken(this.color, 40));
    drawingContext.fillStyle = grad;
    ellipse(0, 0, BALL_R * 2);
    
    // Shine
    fill(255, 150);
    ellipse(-BALL_R*0.3, -BALL_R*0.3, BALL_R * 0.6);
    
    // Number/identifier for colors
    if (!this.isRed && this.value > 0) {
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(10);
      textStyle(BOLD);
      text(this.value, 0, 0);
    }
    
    pop();
  }

  checkCollision(other) {
    let d = p5.Vector.dist(this.pos, other.pos);
    let minD = BALL_R * 2;
    
    if (d < minD && d > 0) {
      // Resolve overlap
      let overlap = minD - d;
      let n = p5.Vector.sub(this.pos, other.pos).normalize();
      let move = n.copy().mult(overlap * 0.5);
      this.pos.add(move);
      other.pos.sub(move);
      
      // Elastic collision
      let relVel = p5.Vector.sub(this.vel, other.vel);
      let speed = relVel.dot(n);
      
      if (speed < 0) {
        let impulse = n.mult(speed * 0.9); // Slight energy loss
        this.vel.sub(impulse);
        other.vel.add(impulse);
        
        // Transfer some spin
        let spinTransfer = this.spin.copy().mult(0.3);
        other.spin.add(spinTransfer);
        this.spin.sub(spinTransfer);
      }
      
      return true;
    }
    return false;
  }

  checkPocket() {
    for (let p of pockets) {
      if (this.pos.dist(p) < POCKET_R - 5) {
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
  constructor(x, y, col) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(1, 3));
    this.color = col;
    this.life = 255;
    this.size = random(2, 5);
  }
  
  update() {
    this.pos.add(this.vel);
    this.vel.mult(0.95);
    this.life -= 5;
  }
  
  show() {
    noStroke();
    let c = color(this.color);
    c.setAlpha(this.life);
    fill(c);
    ellipse(this.pos.x, this.pos.y, this.size);
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

function createCollisionParticles(x, y, col) {
  for (let i = 0; i < 3; i++) {
    particles.push(new Particle(x, y, col));
  }
}

// ────────────────────────────────────────────────
// TABLE & RENDERING
// ────────────────────────────────────────────────

function drawTable() {
  // Background
  background(30, 30, 35);
  
  // Wood frame
  fill(101, 67, 33);
  stroke(60, 40, 20);
  strokeWeight(4);
  rect(20, 20, TABLE_W + 80, TABLE_H + 80, 15);
  
  // Inner cushion area
  fill(20, 100, 40);
  noStroke();
  rect(50, 50, TABLE_W + 20, TABLE_H + 20);
  
  // Baize (playing surface)
  fill(25, 120, 55);
  rect(60, 60, TABLE_W, TABLE_H);
  
  // Markings
  drawMarkings();
  
  // Pockets
  drawPockets();
}

function drawMarkings() {
  stroke(255, 200);
  strokeWeight(2);
  noFill();
  
  // Baulk line
  let baulkX = 60 + TABLE_W * 0.22;
  line(baulkX, 60, baulkX, 60 + TABLE_H);
  
  // The D
  let dRadius = 120;
  arc(baulkX, 60 + TABLE_H/2, dRadius, dRadius, HALF_PI, -HALF_PI);
  
  // Spot markers
  fill(255, 100);
  noStroke();
  
  // Blue spot
  ellipse(60 + TABLE_W/2, 60 + TABLE_H/2, 6);
  
  // Pink spot
  ellipse(60 + TABLE_W * 0.75, 60 + TABLE_H/2, 6);
  
  // Black spot
  ellipse(60 + TABLE_W * 0.88, 60 + TABLE_H/2, 6);
  
  // Pyramid spot (for reds)
  ellipse(60 + TABLE_W * 0.77, 60 + TABLE_H/2, 6);
  
  // Brown spot
  ellipse(baulkX, 60 + TABLE_H/2, 6);
  
  // Green spot
  ellipse(baulkX, 60 + TABLE_H * 0.35, 6);
  
  // Yellow spot
  ellipse(baulkX, 60 + TABLE_H * 0.65, 6);
}

function drawPockets() {
  for (let p of pockets) {
    // Pocket interior
    fill(10);
    noStroke();
    ellipse(p.x, p.y, POCKET_R * 2);
    
    // Pocket rim highlight
    noFill();
    stroke(80, 60, 40);
    strokeWeight(3);
    ellipse(p.x, p.y, POCKET_R * 2 - 4);
  }
}

function drawTrajectory() {
  // Ray casting for trajectory prediction
  let start = cueBall.pos.copy();
  let dir = p5.Vector.fromAngle(cueAngle);
  let ray = dir.copy().mult(2000);
  let end = p5.Vector.add(start, ray);
  
  // Simple trajectory line (would need proper ray-casting for bounces)
  stroke(255, 100);
  strokeWeight(2);
  setLineDash([10, 10]);
  line(start.x, start.y, end.x, end.y);
  setLineDash([]);
  
  // Find first collision
  let closest = null;
  let minDist = Infinity;
  
  for (let b of balls) {
    if (b === cueBall || b.potted) continue;
    let toBall = p5.Vector.sub(b.pos, start);
    let proj = toBall.dot(dir);
    if (proj > 0 && proj < 500) {
      let closestPoint = p5.Vector.add(start, dir.copy().mult(proj));
      let dist = p5.Vector.dist(closestPoint, b.pos);
      if (dist < BALL_R * 2 && proj < minDist) {
        minDist = proj;
        closest = b;
      }
    }
  }
  
  if (closest) {
    // Show target direction
    let hitPoint = p5.Vector.add(start, dir.copy().mult(minDist - BALL_R));
    let targetDir = p5.Vector.sub(closest.pos, hitPoint).normalize();
    let targetEnd = p5.Vector.add(closest.pos, targetDir.mult(100));
    
    stroke(255, 50, 50, 150);
    line(closest.pos.x, closest.pos.y, targetEnd.x, targetEnd.y);
  }
}

function setLineDash(list) {
  drawingContext.setLineDash(list);
}

function drawGhostBall() {
  let ghostPos = createVector(mouseX, mouseY);
  
  // Snap to cue ball distance for realistic aiming
  let dir = p5.Vector.sub(ghostPos, cueBall.pos);
  let dist = dir.mag();
  if (dist > 200) {
    dir.setMag(200);
    ghostPos = p5.Vector.add(cueBall.pos, dir);
  }
  
  // Check if valid position
  let valid = true;
  for (let b of balls) {
    if (b !== cueBall && !b.potted && p5.Vector.dist(ghostPos, b.pos) < BALL_R * 2) {
      valid = false;
      break;
    }
  }
  
  noFill();
  stroke(valid ? 255 : 255, 0, 0, 150);
  strokeWeight(2);
  ellipse(ghostPos.x, ghostPos.y, BALL_R * 2);
  
  // Contact point indicator
  let contactDir = p5.Vector.sub(cueBall.pos, ghostPos).normalize();
  let contactPoint = p5.Vector.add(ghostPos, contactDir.mult(BALL_R));
  fill(valid ? 255 : 255, 0, 0, 200);
  noStroke();
  ellipse(contactPoint.x, contactPoint.y, 6);
}

function drawCueStick() {
  if (!cueBall.potted) {
    push();
    translate(cueBall.pos.x, cueBall.pos.y);
    rotate(cueAngle);
    
    // Cue stick animation
    let pullBack = isCharging ? map(charge, 0, maxCharge, 0, 50) : 0;
    if (gameState === 'shooting') pullBack = 0;
    
    translate(-80 - pullBack, 0);
    
    // Cue shaft
    stroke(222, 184, 135);
    strokeWeight(8);
    line(0, 0, -300, 0);
    
    // Cue tip
    stroke(139, 69, 19);
    strokeWeight(10);
    line(0, 0, 15, 0);
    
    // Cue butt
    stroke(101, 67, 33);
    strokeWeight(12);
    line(-300, 0, -320, 0);
    
    pop();
  }
}

function drawPowerMeter() {
  push();
  translate(cueBall.pos.x, cueBall.pos.y - 40);
  
  // Background
  fill(0, 100);
  rect(-50, 0, 100, 10, 5);
  
  // Fill
  let pct = charge / maxCharge;
  let r = map(pct, 0, 1, 50, 255);
  let g = map(pct, 0, 1, 255, 50);
  fill(r, g, 50);
  rect(-50, 0, 100 * pct, 10, 5);
  
  // Text
  fill(255);
  textAlign(CENTER);
  textSize(12);
  textStyle(BOLD);
  text(int(pct * 100) + "%", 0, -5);
  
  pop();
}

function drawUI() {
  // Score panel background
  fill(20, 20, 25, 240);
  noStroke();
  rect(0, TABLE_H + 100, width, 50);
  
  // Player scores
  textAlign(LEFT);
  textSize(24);
  textStyle(BOLD);
  
  // Player 1
  fill(currentPlayer === 1 ? '#4CAF50' : '#fff');
  text(`Player 1: ${scores[0]}`, 50, TABLE_H + 135);
  
  // Player 2
  fill(currentPlayer === 2 ? '#4CAF50' : '#fff');
  text(`Player 2: ${scores[1]}`, 250, TABLE_H + 135);
  
  // Current break
  fill(255, 200, 100);
  text(`Break: ${currentBreak}`, 450, TABLE_H + 135);
  
  // Reds remaining
  fill(255, 100, 100);
  text(`Reds: ${redsRemaining()}`, 600, TABLE_H + 135);
  
  // Instructions
  if (gameState === 'aiming') {
    fill(255, 255);
    textAlign(CENTER);
    textSize(16);
    text("HOLD CLICK TO CHARGE • RELEASE TO SHOOT", width/2, 30);
  } else if (gameState === 'gameover') {
    fill(255, 215, 0);
    textAlign(CENTER);
    textSize(32);
    text(`FRAME ENDED! Player ${scores[0] > scores[1] ? 1 : 2} Wins!`, width/2, 30);
    textSize(16);
    fill(255);
    text("Press R to restart", width/2, 55);
  }
  
  // Foul indicator
  if (foulCommitted) {
    fill(255, 0, 0);
    textAlign(RIGHT);
    textSize(20);
    text("FOUL!", width - 50, 40);
  }
}

// ────────────────────────────────────────────────
// INPUT HANDLING
// ────────────────────────────────────────────────

function mousePressed() {
  if (gameState === 'aiming' && !cueBall.potted) {
    isCharging = true;
    charge = 0;
  }
}

function mouseReleased() {
  if (isCharging && gameState === 'aiming') {
    shoot();
  }
}

function shoot() {
  if (charge < 2) {
    isCharging = false;
    charge = 0;
    return;
  }
  
  gameState = 'shooting';
  
  // Animate cue strike
  let force = p5.Vector.fromAngle(cueAngle).mult(charge * 0.8);
  cueBall.vel.set(force);
  
  // Add slight spin based on mouse offset from center
  let offset = (mouseY - cueBall.pos.y) * 0.001;
  cueBall.spin.set(0, offset);
  
  cameraShake = charge * 0.3;
  
  setTimeout(() => {
    gameState = 'moving';
    isCharging = false;
    charge = 0;
  }, 100);
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    if (gameState === 'gameover') {
      initGame();
    } else {
      // Quick reset
      initGame();
    }
  }
}

// ────────────────────────────────────────────────
// GAME INITIALIZATION
// ────────────────────────────────────────────────

function initGame() {
  balls = [];
  gameState = 'aiming';
  currentPlayer = 1;
  scores = [0, 0];
  currentBreak = 0;
  ballsPottedThisShot = [];
  foulCommitted = false;
  shotHistory = [];
  
  // Cue Ball (in the D)
  cueBall = new Ball(60 + TABLE_W * 0.18, 60 + TABLE_H * 0.5, '#ffffff', 0, false, 'Cue');
  balls.push(cueBall);
  
  // Colors
  let baulkX = 60 + TABLE_W * 0.22;
  colors = [
    new Ball(baulkX, 60 + TABLE_H * 0.65, '#ffdd00', 2, false, 'Yellow'),  // Yellow
    new Ball(baulkX, 60 + TABLE_H * 0.5, '#8B4513', 4, false, 'Brown'),   // Brown
    new Ball(baulkX, 60 + TABLE_H * 0.35, '#228B22', 3, false, 'Green'),  // Green
    new Ball(60 + TABLE_W * 0.5, 60 + TABLE_H * 0.5, '#0000ff', 5, false, 'Blue'),    // Blue
    new Ball(60 + TABLE_W * 0.75, 60 + TABLE_H * 0.5, '#ff69b4', 6, false, 'Pink'),   // Pink
    new Ball(60 + TABLE_W * 0.88, 60 + TABLE_H * 0.5, '#000000', 7, false, 'Black')   // Black
  ];
  balls.push(...colors);
  
  // Reds (full pyramid)
  let startX = 60 + TABLE_W * 0.77;
  let startY = 60 + TABLE_H * 0.5;
  let rows = 5;
  
  for (let row = 0; row < rows; row++) {
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
  return color(red(c) + amt, green(c) + amt, blue(c) + amt);
}

function darken(col, amt) {
  let c = color(col);
  return color(max(0, red(c) - amt), max(0, green(c) - amt), max(0, blue(c) - amt));
}
