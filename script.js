let points = [];
const duration = 1200;

const svg = d3.select("svg");

const randomButton = document.getElementById('random');
const clearButton = document.getElementById('clear');
const runButton = document.getElementById('run');

randomButton.addEventListener('click', randomButtonClicked);
clearButton.addEventListener('click', clearButtonClicked);
runButton.addEventListener('click', runButtonClicked);

function randomButtonClicked() {
    for (i = 0; i < 10; i++) {
        points.push({ x: Math.random() * 600 + 50, y: Math.random() * 300 + 50 });
        svg.append("circle")
            .attr("cx", points[i].x)
            .attr("cy", points[i].y)
            .attr("r", 3)
            .attr("class", "point");
    }
}

// Function linked to the second button
function clearButtonClicked() {
    points = [];
    svg.selectAll("*").remove(); // Selects and removes all child elements in the SVG
}

function runButtonClicked() {
    run();
}

// add points on click
svg.on("click", function (event) {
    const coords = d3.pointer(event);
    points.push({ x: coords[0], y: coords[1] });
    svg.append("circle")
        .attr("cx", coords[0])
        .attr("cy", coords[1])
        .attr("r", 3)
        .attr("class", "point");
});

function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function drawPair(pair) {
    return svg.append("line", svg.firstChild)
        .attr("x1", pair[0].x)
        .attr("y1", pair[0].y)
        .attr("x2", pair[1].x)
        .attr("y2", pair[1].y)
        .attr("class", "pair-line");
}

function highlightSubproblem(xStart, xEnd, className) {
    return svg.append("rect")
        .attr("x", xStart)
        .attr("y", 0)
        .attr("width", Math.max(0, xEnd - xStart))
        .attr("height", svg.attr("height"))
        .attr("class", className)
}

function drawBoundary(x) {
    return svg.append("line")
        .attr("x1", x)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", svg.attr("height"))
        .attr("class", "division-line");
}

function bruteForce(points) {
    let minDist = Infinity;
    let closestPair = [];
    for (let i = 0; i < points.length; ++i) {
        for (let j = i + 1; j < points.length; ++j) {
            let dist = distance(points[i], points[j]);
            if (dist < minDist) {
                minDist = dist;
                closestPair = [points[i], points[j]];
            }
        }
    }
    return closestPair;
}

async function closestPairRec(pointsX, pointsY, leftBoundary, rightBoundary) {
    const subproblem = highlightSubproblem(leftBoundary, rightBoundary, "subproblem");
    await new Promise(resolve => setTimeout(resolve, duration));

    if (pointsX.length <= 3) {
        const closestPair = bruteForce(pointsX);
        const pair = drawPair(closestPair);
        await new Promise(resolve => setTimeout(resolve, duration));
        subproblem.remove();
        return [closestPair, pair];
    }

    const midIdx = Math.floor(pointsX.length / 2);
    const midPoint = pointsX[midIdx];
    const midPointX = pointsX[midIdx].x;
    const boundary = drawBoundary(midPointX);
    await new Promise(resolve => setTimeout(resolve, duration));

    subproblem.remove();

    // left subproblem
    const leftSubproblemRightBoundary = midPointX;
    const leftSubproblemLeftBoundary = leftBoundary !== null ? leftBoundary : pointsX[0].x;
    const [pairLeft, leftLine] = await closestPairRec(pointsX.slice(0, midIdx), pointsY.filter(p => p.x < midPointX), leftSubproblemLeftBoundary, leftSubproblemRightBoundary);

    // right subproblem
    const rightSubproblemLeftBoundary = midPointX;
    const rightSubproblemRightBoundary = rightBoundary !== null ? rightBoundary : pointsX[pointsX.length - 1].x;
    const [pairRight, rightLine] = await closestPairRec(pointsX.slice(midIdx), pointsY.filter(p => p.x >= midPointX), rightSubproblemLeftBoundary, rightSubproblemRightBoundary);

    const leftBlock = highlightSubproblem(leftSubproblemLeftBoundary, leftSubproblemRightBoundary, "left-right");
    const rightBlock = highlightSubproblem(rightSubproblemLeftBoundary, rightSubproblemRightBoundary, "left-right");

    await new Promise(resolve => setTimeout(resolve, duration));

    // comapre left and right
    let closestPair = pairLeft;
    let bestLine = leftLine;
    let notBestLine = rightLine;
    let minDist = distance(pairLeft[0], pairLeft[1]);

    if (minDist > distance(pairRight[0], pairRight[1])) {
        minDist = distance(pairRight[0], pairRight[1]);
        closestPair = pairRight;
        bestLine = rightLine;
        notBestLine = leftLine;
    }

    // update closest pair
    notBestLine.remove();
    await new Promise(resolve => setTimeout(resolve, duration));

    // highlight the strip area for merging
    const stripLeft = midPoint.x - minDist;
    const stripRight = midPoint.x + minDist;

    const stripBlock = highlightSubproblem(stripLeft, stripRight, "strip");

    await new Promise(resolve => setTimeout(resolve, duration));

    let changed = false;
    // Check the strip in the middle
    const strip = pointsY.filter(p => Math.abs(p.x - midPoint.x) < minDist);
    for (let i = 0; i < strip.length; ++i) {
        for (let j = i + 1; j < strip.length && (strip[j].y - strip[i].y) < minDist; ++j) {
            if (distance(strip[i], strip[j]) < minDist) {
                minDist = distance(strip[i], strip[j]);
                closestPair = [strip[i], strip[j]];
                changed = true;
            }
        }
    }

    if (changed) {
        leftLine.remove();
        rightLine.remove();
        bestLine = drawPair(closestPair);
        await new Promise(resolve => setTimeout(resolve, duration));
    }

    leftBlock.remove();
    rightBlock.remove();
    boundary.remove(); // Remove the division line
    stripBlock.remove(); // Remove the strip highlight
    await new Promise(resolve => setTimeout(resolve, duration));
    return [closestPair, bestLine];
}

document.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
        run();
    }

    if (event.code === 'Space') {
        randomButtonClicked();
    }

    if (event.code === 'Delete') {
        randomButtonClicked();
    }
});

function run() {
    svg.selectAll(".pair-line").remove();
    svg.selectAll(".division-line").remove();

    const pointsX = points.slice().sort((a, b) => a.x - b.x);
    const pointsY = points.slice().sort((a, b) => a.y - b.y);
    closestPairRec(pointsX, pointsY, null, null);
}