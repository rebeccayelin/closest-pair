const points = [];
const svg = d3.select("svg");
const duration = 1000;

svg.on("click", function (event) {
    const coords = d3.pointer(event);
    points.push({ x: coords[0], y: coords[1] });
    svg.append("circle")
        .attr("cx", coords[0])
        .attr("cy", coords[1])
        .attr("r", 5)
        .attr("class", "point");
});

function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

async function highlightPoints(points, className) {
    svg.selectAll(`.${className}`)
        .data(points)
        .enter()
        .append("circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 5)
        .attr("class", className);
    await new Promise(resolve => setTimeout(resolve, duration));
}

async function highlightSubproblemArea(xStart, xEnd, color, className) {
    console.log(xStart, xEnd);
    const width = Math.max(0, xEnd - xStart); // Ensure width is non-negative

    // Highlight the subproblem area with a rectangle
    svg.append("rect")
        .attr("x", xStart)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", svg.attr("height"))
        .attr("fill", color)
        .attr("class", className)
        .attr("opacity", 0.3);

    await new Promise(resolve => setTimeout(resolve, duration)); // Add delay to visualize
}

async function unhighlightSubproblemArea(className) {
    // Remove the highlight from the subproblem area
    svg.selectAll(`.${className}`).remove();
}

async function unhighlightSubproblemArea(className) {
    // Remove the highlight from the subproblem area
    svg.selectAll(`.${className}`).remove();
}

async function drawLineBetweenPoints(point1, point2, className) {
    svg.append("line")
        .attr("x1", point1.x)
        .attr("y1", point1.y)
        .attr("x2", point2.x)
        .attr("y2", point2.y)
        .attr("class", className);
    await new Promise(resolve => setTimeout(resolve, duration));
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
    await highlightSubproblemArea(leftBoundary, rightBoundary, "green", "right-subproblem-area");

    if (pointsX.length <= 3) {
        let closestPair = bruteForce(pointsX);
        await highlightPoints(closestPair, 'closest-pair');
        await unhighlightSubproblemArea("right-subproblem-area");
        return closestPair;
    }

    const midIndex = Math.floor(pointsX.length / 2);
    const midPoint = pointsX[midIndex];
    const midPointX = pointsX[midIndex].x;

    // draw division line
    const line = svg.append("line")
        .attr("x1", midPointX)
        .attr("y1", 0)
        .attr("x2", midPoint.x)
        .attr("y2", svg.attr("height"))
        .attr("class", "division-line");

    await new Promise(resolve => setTimeout(resolve, duration));

    await unhighlightSubproblemArea("right-subproblem-area");

    const leftSubproblemRightBoundary = midPointX;
    const rightSubproblemLeftBoundary = midPointX;

    const leftSubproblemLeftBoundary = leftBoundary !== null ? leftBoundary : pointsX[0].x;
    const rightSubproblemRightBoundary = rightBoundary !== null ? rightBoundary : pointsX[pointsX.length - 1].x;

    // Highlight, process, and unhighlight the left subproblem
    // await highlightSubproblemArea(leftSubproblemLeftBoundary, leftSubproblemRightBoundary, "pink", "left-subproblem-area");
    const pairLeft = await closestPairRec(pointsX.slice(0, midIndex), pointsY.filter(p => p.x < midPointX), leftSubproblemLeftBoundary, leftSubproblemRightBoundary);
    // await unhighlightSubproblemArea("left-subproblem-area");

    // Highlight, process, and unhighlight the right subproblem
    // await highlightSubproblemArea(rightSubproblemLeftBoundary, rightSubproblemRightBoundary, "green", "right-subproblem-area");
    const pairRight = await closestPairRec(pointsX.slice(midIndex), pointsY.filter(p => p.x >= midPointX), rightSubproblemLeftBoundary, rightSubproblemRightBoundary);
    await unhighlightSubproblemArea("right-subproblem-area");


    // After finding pairLeft and pairRight
    let closestPair = pairLeft;
    let minDist = distance(pairLeft[0], pairLeft[1]);
    await updateClosestPair(closestPair); // Highlight the current closest pair

    if (minDist > distance(pairRight[0], pairRight[1])) {
        minDist = distance(pairRight[0], pairRight[1]);
        closestPair = pairRight;
        await updateClosestPair(closestPair); // Update if the right pair is closer
    }

    // Highlight the strip area
    const stripLeft = midPoint.x - minDist;
    const stripRight = midPoint.x + minDist;

    const stripRect = svg.append("rect")
        .attr("x", stripLeft)
        .attr("y", 0)
        .attr("width", stripRight - stripLeft)
        .attr("height", svg.attr("height"))
        .attr("fill", "blue")
        .attr("opacity", 0.2);

    // Check the strip in the middle
    const strip = pointsY.filter(p => Math.abs(p.x - midPoint.x) < minDist);
    for (let i = 0; i < strip.length; ++i) {
        for (let j = i + 1; j < strip.length && (strip[j].y - strip[i].y) < minDist; ++j) {
            if (distance(strip[i], strip[j]) < minDist) {
                minDist = distance(strip[i], strip[j]);
                closestPair = [strip[i], strip[j]];
                await updateClosestPair(closestPair);
            }
        }
    }

    await new Promise(resolve => setTimeout(resolve, duration)); // Delay to visualize strip checking

    stripRect.remove(); // Remove the strip highlight
    line.remove();  // Remove the division line

    await highlightPoints(closestPair, 'closest-pair');
    return closestPair;
}

async function updateClosestPair(closestPair) {
    svg.selectAll(".closest-pair").remove(); // Remove existing highlights

    // Highlight new closest pair
    svg.selectAll(".closest-pair")
        .data(closestPair)
        .enter()
        .append("circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 5)
        .attr("class", "closest-pair");

    await new Promise(resolve => setTimeout(resolve, duration)); // Add delay to visualize update
}

function clearScreen() {
    svg.selectAll("*").remove(); // Selects and removes all child elements in the SVG
}

document.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
        // remove existing lines
        svg.selectAll(".closest-pair-line").remove();
        svg.selectAll(".division-line").remove();
        // unhighlight existing points
        svg.selectAll(".closest-pair").remove();

        const pointsX = points.slice().sort((a, b) => a.x - b.x);
        const pointsY = points.slice().sort((a, b) => a.y - b.y);
        const closestPair = await closestPairRec(pointsX, pointsY, null, null);

        await drawLineBetweenPoints(closestPair[0], closestPair[1], 'closest-pair-line');
    }

    if (event.key == 'Delete') {
        clearScreen();
        points = []; // Clear the points array
    }
});