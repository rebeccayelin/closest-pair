/* --- State --- */
let points = [];
let isRunning = false;
let runId = 0;
let duration = 1800;
let frames = [];
let currentFrameIndex = -1;
let playIntervalId = null;

/* --- DOM refs --- */
const svg = d3.select("svg");
const SVG_WIDTH = +svg.attr("width");
const SVG_HEIGHT = +svg.attr("height");

const randomButton = document.getElementById("random");
const clearButton = document.getElementById("clear");
const runButton = document.getElementById("run");
const stepBackButton = document.getElementById("step-back");
const stepFwdButton = document.getElementById("step-fwd");
const speedSlider = document.getElementById("speed");
const stepAnnotationEl = document.getElementById("step-annotation");
const runIconEl = document.querySelector("#run .btn-icon");

const ANNOTATION_PADDING = 12;
const ANNOTATION_X = 12;
const ANNOTATION_BOX_HEIGHT = 28;
const ANNOTATION_BOX_HEIGHT_WITH_META = 48;
const ANNOTATION_BOX_WIDTH = 380;
const ANNOTATION_Y = SVG_HEIGHT - ANNOTATION_BOX_HEIGHT - 10;
const ANNOTATION_Y_WITH_META = SVG_HEIGHT - ANNOTATION_BOX_HEIGHT_WITH_META - 10;
let canvasAnnotationGroup = null;

/* --- Geometry --- */
function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function bruteForce(pts) {
  let minDist = Infinity;
  let closestPair = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = distance(pts[i], pts[j]);
      if (d < minDist) {
        minDist = d;
        closestPair = [pts[i], pts[j]];
      }
    }
  }
  return closestPair;
}

function fmtDist(d) {
  return `${Math.round(d)} px`;
}

/* --- Drawing helpers --- */
function drawPair(pair) {
  const line = svg
    .insert("line", ":first-child")
    .attr("x1", pair[0].x)
    .attr("y1", pair[0].y)
    .attr("x2", pair[1].x)
    .attr("y2", pair[1].y)
    .attr("class", "pair-line");
  bringAnnotationToFront();
  return line;
}

function highlightSubproblem(xStart, xEnd, className, label, labelPosition = "top") {
  const g = svg.insert("g", ":first-child").attr("class", "highlight-group");
  const w = Math.max(0, xEnd - xStart);
  g.append("rect")
    .attr("x", xStart)
    .attr("y", 0)
    .attr("width", w)
    .attr("height", SVG_HEIGHT)
    .attr("class", className);
  if (label && labelPosition !== "middle") {
    const y =
      labelPosition === "bottom"
        ? SVG_HEIGHT - 12
        : 20;
    g.append("text")
      .attr("x", xStart + w / 2)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("class", "highlight-label")
      .text(label);
  }
  bringAnnotationToFront();
  return g;
}

function drawBoundary(x, faint = false) {
  const line = svg
    .insert("line", ".canvas-annotation")
    .attr("x1", x)
    .attr("y1", 0)
    .attr("x2", x)
    .attr("y2", SVG_HEIGHT)
    .attr("class", faint ? "division-line-faint" : "division-line");
  bringAnnotationToFront();
  return line;
}

/* --- Frame-based playback --- */
function clearAlgorithmVisuals() {
  svg.selectAll(".pair-line").remove();
  svg.selectAll(".division-line").remove();
  svg.selectAll(".division-line-faint").remove();
  svg.selectAll(".highlight-group").remove();
  svg.selectAll(".point").attr("r", 3);
}

function drawStripLabel(strip, delta) {
  const x = strip.xStart + (strip.xEnd - strip.xStart) / 2;
  const y = SVG_HEIGHT / 2;
  const labelGroup = svg
    .insert("g", ".canvas-annotation")
    .attr("class", "highlight-group");
  const labelText = delta != null ? `merge strip (width 2δ ≈ ${fmtDist(2 * delta)})` : "merge strip";
  const textEl = labelGroup
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("class", "highlight-label")
    .text(labelText);
  const pad = 8;
  const bbox = textEl.node().getBBox();
  labelGroup
    .insert("rect", "text")
    .attr("x", bbox.x - pad)
    .attr("y", bbox.y - pad)
    .attr("width", bbox.width + pad * 2)
    .attr("height", bbox.height + pad * 2)
    .attr("rx", 6)
    .attr("class", "strip-label-bg");
}

function renderFrame(frame, frameIndex = -1) {
  clearAlgorithmVisuals();
  if (!frame) return;
  const path = frame.boundariesPath || frame.boundaries || [];
  const total = frames.length;
  const step = frameIndex >= 0 ? frameIndex + 1 : 0;
  const nextAnnotation = frameIndex >= 0 && frameIndex < total - 1 ? frames[frameIndex + 1]?.annotation : null;
  const justDidAnnotation = frameIndex > 0 ? frames[frameIndex - 1]?.annotation : null;
  setStepAnnotation(frame.annotation, { step, total, next: nextAnnotation, justDid: justDidAnnotation });
  // Draw layers from bottom to top: highlights first, then division lines (faint path + bold current), then pair lines
  if (frame.subproblem) {
    highlightSubproblem(
      frame.subproblem.xStart,
      frame.subproblem.xEnd,
      "subproblem",
      null
    );
  }
  if (frame.leftRight) {
    const { left, right } = frame.leftRight;
    highlightSubproblem(left.xStart, left.xEnd, "left-right", "L");
    highlightSubproblem(right.xStart, right.xEnd, "left-right", "R");
  }
  if (frame.strip) {
    highlightSubproblem(
      frame.strip.xStart,
      frame.strip.xEnd,
      "strip",
      null,
      "middle"
    );
  }
  if (path.length > 0) {
    path.slice(0, -1).forEach((x) => drawBoundary(x, true));
    drawBoundary(path[path.length - 1], false);
  }
  if (frame.pairIndices && frame.pairIndices.length > 0) {
    frame.pairIndices.forEach(([i, j]) => {
      if (i >= 0 && j >= 0 && points[i] && points[j]) {
        const p1 = points[i],
          p2 = points[j];
        svg
          .insert("line", ".point")
          .attr("x1", p1.x)
          .attr("y1", p1.y)
          .attr("x2", p2.x)
          .attr("y2", p2.y)
          .attr("class", "pair-line");
      }
    });
  }
  if (frame.strip) drawStripLabel(frame.strip, frame.delta);
  bringAnnotationToFront();
}

function updateStepButtons() {
  if (stepBackButton) stepBackButton.disabled = !frames.length || currentFrameIndex <= 0;
  if (stepFwdButton) stepFwdButton.disabled = !frames.length || currentFrameIndex >= frames.length - 1;
  if (randomButton) randomButton.disabled = isRunning || frames.length > 0;
  svg.style("pointer-events", isRunning || frames.length > 0 ? "none" : "auto");
}

/* --- Animation helper --- */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCanvasAnnotation() {
  if (!canvasAnnotationGroup || canvasAnnotationGroup.empty()) {
    canvasAnnotationGroup = svg.append("g").attr("class", "canvas-annotation");
    canvasAnnotationGroup
      .append("rect")
      .attr("class", "canvas-annotation-bg")
      .attr("x", ANNOTATION_X)
      .attr("y", ANNOTATION_Y)
      .attr("width", ANNOTATION_BOX_WIDTH)
      .attr("height", ANNOTATION_BOX_HEIGHT)
      .attr("rx", 6);
    canvasAnnotationGroup
      .append("text")
      .attr("class", "canvas-annotation-text")
      .attr("x", ANNOTATION_X + 10)
      .attr("y", ANNOTATION_Y + ANNOTATION_BOX_HEIGHT / 2 + 2)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle");
    canvasAnnotationGroup
      .append("text")
      .attr("class", "canvas-annotation-meta")
      .attr("x", ANNOTATION_X + 10)
      .attr("y", ANNOTATION_Y + ANNOTATION_BOX_HEIGHT - 2)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "hanging");
  }
  return canvasAnnotationGroup;
}

function bringAnnotationToFront() {
  if (canvasAnnotationGroup && !canvasAnnotationGroup.empty()) {
    svg.node().appendChild(canvasAnnotationGroup.node());
  }
}

const ANNOTATION_MAX_META_CHARS = 56;

function setStepAnnotation(text, meta = null) {
  if (stepAnnotationEl) stepAnnotationEl.textContent = text;
  ensureCanvasAnnotation();
  const g = canvasAnnotationGroup;
  const textEl = g.select(".canvas-annotation-text").text(text);
  const metaEl = g.select(".canvas-annotation-meta");
  const rectEl = g.select(".canvas-annotation-bg");
  const hasMeta = meta && meta.total > 0;
  const parts = [];
  if (hasMeta) parts.push(`Step ${meta.step} of ${meta.total}`);
  if (hasMeta && meta.next) parts.push(`Next: ${meta.next}`);
  else if (hasMeta && meta.justDid) parts.push(`Just did: ${meta.justDid}`);
  let metaStr = parts.length ? parts.join(" · ") : "";
  if (metaStr.length > ANNOTATION_MAX_META_CHARS) {
    metaStr = metaStr.slice(0, ANNOTATION_MAX_META_CHARS - 1).trimEnd() + "…";
  }
  metaEl.text(metaStr);
  const show = !!text || !!metaStr;
  rectEl.attr("visibility", show ? "visible" : "hidden");
  textEl.attr("visibility", text ? "visible" : "hidden");
  metaEl.attr("visibility", metaStr ? "visible" : "hidden");
  if (show) {
    const pad = 20;
    const maxBoxW = SVG_WIDTH - ANNOTATION_X - 20;
    const textBbox = textEl.node().getBBox();
    const metaBbox = metaEl.node().getBBox();
    const textW = (textBbox && textBbox.width > 0) ? textBbox.width : 200;
    const metaW = (metaBbox && metaBbox.width > 0) ? metaBbox.width : 0;
    const desiredW = Math.max(textW, metaW) + pad;
    const w = Math.max(80, Math.min(maxBoxW, desiredW));
    const h = hasMeta && metaStr ? ANNOTATION_BOX_HEIGHT_WITH_META : ANNOTATION_BOX_HEIGHT;
    const y = hasMeta && metaStr ? ANNOTATION_Y_WITH_META : ANNOTATION_Y;
    rectEl.attr("width", w).attr("height", h).attr("y", y);
    textEl.attr("y", y + (metaStr ? 15 : h / 2 + 2));
    metaEl.attr("y", y + h - 18);
    bringAnnotationToFront();
  }
}

function setControlsEnabled(enabled) {
  isRunning = !enabled;
  if (runIconEl) runIconEl.textContent = enabled ? "▶" : "⏸";
  runButton.setAttribute("aria-label", enabled ? "Run algorithm" : "Pause / stop");
  clearButton.disabled = false;
  updateStepButtons();
}

/* --- Algorithm: record mode (yields frames for step/playback) --- */
async function closestPairRecRecord(pointsX, pointsY, leftBoundary, rightBoundary, side, step, leftPairIndicesPersist = [], path = [], pathDesc = "root") {
  const leftB = leftBoundary ?? (pointsX[0] && pointsX[0].x);
  const rightB = rightBoundary ?? (pointsX[pointsX.length - 1] && pointsX[pointsX.length - 1].x);
  const sideLabel = side === "left" ? "left " : side === "right" ? "right " : "";
  const merge = (current) => [...leftPairIndicesPersist, ...(current || [])];
  const pathStr = pathDesc ? ` — ${pathDesc}` : "";

  await step({
    annotation: `examining ${sideLabel}subproblem (${pointsX.length} point${pointsX.length === 1 ? "" : "s"})${pathStr}`,
    subproblem: leftB != null && rightB != null ? { xStart: leftB, xEnd: rightB } : null,
    boundariesPath: path,
    leftRight: null,
    strip: null,
    pairIndices: merge([]),
  });

  if (pointsX.length <= 1) {
    const subLabel = side === "left" ? "Left subproblem" : side === "right" ? "Right subproblem" : "Subproblem";
    await step({
      annotation: `${subLabel.toLowerCase()} has ≤1 point; skip${pathStr}`,
      subproblem: null,
      boundariesPath: path,
      leftRight: null,
      strip: null,
      pairIndices: merge([]),
    });
    return [null, null];
  }

  if (pointsX.length <= 3) {
    const closestPair = bruteForce(pointsX);
    const pairIndices =
      closestPair.length === 2
        ? [[points.indexOf(closestPair[0]), points.indexOf(closestPair[1])]]
        : [];
    const dStr = closestPair.length === 2 ? `, d ≈ ${fmtDist(distance(closestPair[0], closestPair[1]))}` : "";
    await step({
      annotation: `base case (brute-force over ≤3 points)${dStr}${pathStr}`,
      subproblem: { xStart: leftB, xEnd: rightB },
      boundariesPath: path,
      leftRight: null,
      strip: null,
      pairIndices: merge(pairIndices),
    });
    return [closestPair, pairIndices];
  }

  const midIdx = Math.floor(pointsX.length / 2);
  const midPoint = pointsX[midIdx];
  const midX = midPoint.x;
  const leftL = leftB;
  const rightR = rightB;
  const newPath = path.concat(midX);

  await step({
    annotation: `divide at median x${pathStr}`,
    subproblem: { xStart: leftB, xEnd: rightB },
    boundariesPath: newPath,
    leftRight: null,
    strip: null,
    pairIndices: merge([]),
  });

  const [pairLeft, leftPairIndices] = await closestPairRecRecord(
    pointsX.slice(0, midIdx),
    pointsY.filter((p) => p.x < midX),
    leftL,
    midX,
    "left",
    step,
    [],
    newPath,
    pathDesc + " → left"
  );
  const [pairRight, rightPairIndices] = await closestPairRecRecord(
    pointsX.slice(midIdx),
    pointsY.filter((p) => p.x >= midX),
    midX,
    rightR,
    "right",
    step,
    leftPairIndices && leftPairIndices.length ? leftPairIndices : [],
    newPath,
    pathDesc + " → right"
  );

  const bothPairs = [];
  if (leftPairIndices && leftPairIndices.length > 0) bothPairs.push(...leftPairIndices);
  if (rightPairIndices && rightPairIndices.length > 0) bothPairs.push(...rightPairIndices);

  await step({
    annotation: `compare left and right closest pairs${pathStr}`,
    subproblem: null,
    boundariesPath: newPath,
    leftRight: { left: { xStart: leftL, xEnd: midX }, right: { xStart: midX, xEnd: rightR } },
    strip: null,
    pairIndices: bothPairs,
  });

  let closestPair = pairLeft;
  let bestIndices = leftPairIndices && leftPairIndices.length ? leftPairIndices : [];
  let minDist = Infinity;
  if (pairLeft && pairLeft.length === 2) minDist = distance(pairLeft[0], pairLeft[1]);
  if (pairRight && pairRight.length === 2) {
    const d = distance(pairRight[0], pairRight[1]);
    if (d < minDist) {
      minDist = d;
      closestPair = pairRight;
      bestIndices = rightPairIndices && rightPairIndices.length ? rightPairIndices : [];
    }
  }

  const closerStr = Number.isFinite(minDist) ? ` (d ≈ ${fmtDist(minDist)})` : "";
  await step({
    annotation: `take the closer of the two${closerStr}${pathStr}`,
    subproblem: null,
    boundariesPath: newPath,
    leftRight: { left: { xStart: leftL, xEnd: midX }, right: { xStart: midX, xEnd: rightR } },
    strip: null,
    pairIndices: bestIndices,
  });

  if (!closestPair || closestPair.length !== 2) {
    return [null, bestIndices];
  }

  const stripLeft = midPoint.x - minDist;
  const stripRight = midPoint.x + minDist;
  const deltaStr = ` (δ ≈ ${fmtDist(minDist)}, strip width 2δ)`;
  await step({
    annotation: `merge: check merge strip${deltaStr}${pathStr}`,
    subproblem: null,
    boundariesPath: newPath,
    leftRight: { left: { xStart: leftL, xEnd: midX }, right: { xStart: midX, xEnd: rightR } },
    strip: { xStart: stripLeft, xEnd: stripRight },
    pairIndices: bestIndices,
    delta: minDist,
  });

  const strip = pointsY.filter((p) => Math.abs(p.x - midPoint.x) < minDist);
  let changed = false;
  for (let i = 0; i < strip.length; i++) {
    for (let j = i + 1; j < strip.length && strip[j].y - strip[i].y < minDist; j++) {
      const d = distance(strip[i], strip[j]);
      if (d < minDist) {
        minDist = d;
        closestPair = [strip[i], strip[j]];
        changed = true;
      }
    }
  }

  const finalIndices =
    closestPair && closestPair.length === 2
      ? [[points.indexOf(closestPair[0]), points.indexOf(closestPair[1])]]
      : bestIndices;

  if (changed) {
    await step({
      annotation: `closer pair found in merge strip — update (d ≈ ${fmtDist(minDist)})${pathStr}`,
      subproblem: null,
      boundariesPath: newPath,
      leftRight: { left: { xStart: leftL, xEnd: midX }, right: { xStart: midX, xEnd: rightR } },
      strip: { xStart: midPoint.x - minDist, xEnd: midPoint.x + minDist },
      pairIndices: finalIndices,
      delta: minDist,
    });
  }

  const finalD = closestPair && closestPair.length === 2 ? distance(closestPair[0], closestPair[1]) : minDist;
  await step({
    annotation: `subproblem complete (d ≈ ${fmtDist(finalD)})${pathStr}`,
    subproblem: null,
    boundariesPath: newPath,
    leftRight: null,
    strip: null,
    pairIndices: finalIndices,
  });

  return [closestPair, finalIndices];
}

function stopPlayback() {
  if (playIntervalId != null) {
    clearTimeout(playIntervalId);
    playIntervalId = null;
  }
  isRunning = false;
  if (runIconEl) runIconEl.textContent = "▶";
  runButton.setAttribute("aria-label", "Play");
  updateStepButtons();
}

function stepBackward() {
  if (!frames.length || currentFrameIndex <= 0) return;
  stopPlayback();
  currentFrameIndex--;
  renderFrame(frames[currentFrameIndex], currentFrameIndex);
  updateStepButtons();
}

function stepForward() {
  if (!frames.length) return;
  stopPlayback();
  if (currentFrameIndex < frames.length - 1) {
    currentFrameIndex++;
    renderFrame(frames[currentFrameIndex], currentFrameIndex);
  }
  updateStepButtons();
}

function startPlayback() {
  if (!frames.length) return;
  if (currentFrameIndex >= frames.length - 1) currentFrameIndex = -1;
  isRunning = true;
  if (runIconEl) runIconEl.textContent = "⏸";
  runButton.setAttribute("aria-label", "Pause");
  function tick() {
    currentFrameIndex++;
    renderFrame(frames[currentFrameIndex], currentFrameIndex);
    updateStepButtons();
    if (currentFrameIndex >= frames.length - 1) {
      stopPlayback();
      return;
    }
    playIntervalId = setTimeout(tick, duration);
  }
  playIntervalId = setTimeout(tick, duration);
}

async function run() {
  runId++;
  const currentRunId = runId;
  setControlsEnabled(false);
  setStepAnnotation("building steps…");
  clearAlgorithmVisuals();
  ensureCanvasAnnotation();
  bringAnnotationToFront();

  if (points.length < 2) {
    setStepAnnotation("add at least 2 points to run");
    setControlsEnabled(true);
    return;
  }

  frames = [];
  const step = (frame) => {
    frames.push(frame);
    return Promise.resolve();
  };
  const pointsX = points.slice().sort((a, b) => a.x - b.x);
  const pointsY = points.slice().sort((a, b) => a.y - b.y);
  await closestPairRecRecord(pointsX, pointsY, null, null, null, step);

  if (currentRunId !== runId) return;

  const lastPair = frames.length ? (frames[frames.length - 1].pairIndices || []) : [];
  const doneDist =
    lastPair.length && lastPair[0] && lastPair[0].length === 2
      ? distance(points[lastPair[0][0]], points[lastPair[0][1]])
      : null;
  const doneFrame = {
    annotation: doneDist != null
      ? `done—green line indicates closest pair (d ≈ ${fmtDist(doneDist)})`
      : "done—green line indicates closest pair",
    subproblem: null,
    boundariesPath: [],
    leftRight: null,
    strip: null,
    pairIndices: lastPair,
  };
  frames.push(doneFrame);

  currentFrameIndex = 0;
  renderFrame(frames[0], 0);
  updateStepButtons();
  setControlsEnabled(true);
  startPlayback();
}

function clearAll() {
  runId++;
  points = [];
  frames = [];
  currentFrameIndex = -1;
  stopPlayback();
  svg.selectAll(".point, .pair-line, .division-line, .highlight-group").remove();
  setStepAnnotation("");
  setControlsEnabled(true);
  if (runIconEl) runIconEl.textContent = "▶";
  updateStepButtons();
}

function addPoint(x, y) {
  points.push({ x, y });
  const i = points.length - 1;
  svg
    .append("circle")
    .attr("cx", x)
    .attr("cy", y)
    .attr("r", 3)
    .attr("class", "point")
    .attr("data-point-id", i);
  frames = [];
  currentFrameIndex = -1;
  updateStepButtons();
}

function randomPoints() {
  for (let i = 0; i < 10; i++) {
    addPoint(Math.random() * (SVG_WIDTH - 100) + 50, Math.random() * (SVG_HEIGHT - 100) + 50);
  }
}

/* --- Event handlers --- */
randomButton.addEventListener("click", () => {
  if (isRunning || frames.length > 0) return;
  randomPoints();
});

clearButton.addEventListener("click", () => {
  clearAll();
});

runButton.addEventListener("click", () => {
  if (isRunning) {
    stopPlayback();
    return;
  }
  if (frames.length > 0) {
    startPlayback();
    return;
  }
  run();
});

if (stepBackButton) stepBackButton.addEventListener("click", stepBackward);
if (stepFwdButton) stepFwdButton.addEventListener("click", stepForward);

svg.on("click", (event) => {
  if (isRunning || frames.length > 0) return;
  const [x, y] = d3.pointer(event);
  addPoint(x, y);
});

if (speedSlider) {
  const speedMin = 200;
  const speedMax = 2000;
  speedSlider.addEventListener("input", () => {
    duration = speedMin + speedMax - (+speedSlider.value);
  });
  duration = speedMin + speedMax - (+speedSlider.value);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (isRunning) stopPlayback();
    else if (frames.length > 0) startPlayback();
    else run();
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (!isRunning && frames.length === 0) randomPoints();
  }
  if (event.code === "Delete" || event.code === "Backspace") {
    event.preventDefault();
    clearAll();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepBackward();
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepForward();
  }
});

updateStepButtons();
