statusText = "<h3>Übersicht aller Stände</h3>";

bigDiv = document.getElementById("inner-grid");
function init() {
  bigDiv.innerHTML = '<div class="spacer" id="heading">ERROR</div>';
  document.getElementById("status-text").innerHTML = statusText;
  fetch("/admin/loader/overview.html")
    .then((response) => response.text())
    .then((data) => {
      bigDiv.innerHTML = data;
      setup();
    })
    .catch((err) => console.error(err));
}
allowedToDraw = false;
function setup() {
  var svg = document.getElementById("svgCanvas");
  let isMouseDown = false;
  var selectedCells = [];
  usedCells = [];
  var blacklistCells = [];
  drawGrid();

  function drawGrid(rows = 33, cols = 40, gap = 5, borderRadius = 10) {
    const viewBox = svg.viewBox.baseVal;
    const totalWidth = viewBox.width;
    const totalHeight = viewBox.height;

    const cellWidth = (totalWidth - (cols + 1) * gap) / cols;
    const cellHeight = (totalHeight - (rows + 1) * gap) / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = gap + col * (cellWidth + gap);
        const y = gap + row * (cellHeight + gap);

        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        rect.setAttribute("x", x);
        rect.setAttribute("y", y);
        rect.setAttribute("width", cellWidth);
        rect.setAttribute("height", cellHeight);
        rect.setAttribute("rx", borderRadius);
        rect.setAttribute("ry", borderRadius);
        rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
        rect.setAttribute("id", `cell-${row}-${col}`);
        rect.addEventListener("mousedown", function () {
          if (!allowedToDraw) {
            return;
          }
          isMouseDown = true;
          console.log(`Mouse down on cell at row ${row}, col ${col}`);
          if (selectedCells.includes(`cell-${row}-${col}`)) {
            selectedCells = selectedCells.filter(
              (cell) => cell !== `cell-${row}-${col}`
            );
            rect.classList.remove("selected-rect");
            rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
          } else {
            if (selectedCells.length >= 2) {
              alert("Maximal 2 Kästchen auswählbar!");
              return;
            }
            if (usedCells.includes(`cell-${row}-${col}`)) {
              alert("Dieser Bereich ist bereits belegt!");
              return;
            }
            selectedCells.push(`cell-${row}-${col}`);
            rect.classList.add("selected-rect");
            rect.setAttribute("fill", "rgba(200, 130, 0, 0.3)");
          }
        });

        // Wenn die Maustaste losgelassen wird
        rect.addEventListener("mouseup", function () {
          isMouseDown = false;
          console.log(`Mouse up on cell at row ${row}, col ${col}`);
        });

        // Wenn die Maus über das Kästchen fährt und die Maustaste gedrückt ist
        rect.addEventListener("mouseover", function () {
          if (
            isMouseDown &&
            selectedCells.length < 10 &&
            !selectedCells.includes(`cell-${row}-${col}`)
          ) {
            if (selectedCells.includes(`cell-${row}-${col}`)) {
              selectedCells = selectedCells.filter(
                (cell) => cell !== `cell-${row}-${col}`
              );
              rect.classList.remove("selected-rect");
              rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
            } else {
              if (usedCells.includes(`cell-${row}-${col}`)) {
                return;
              }
              selectedCells.push(`cell-${row}-${col}`);
              rect.classList.add("selected-rect");
              rect.setAttribute("fill", "rgba(200, 130, 0, 0.3)");
            }
          }
        });
        if (!blacklistCells.includes(`cell-${row}-${col}`)) {
          svg.appendChild(rect);
        }
      }
    }
  }

  function getMapSelectionCoords() {
    return selectedCells;
  }
fetch("/admin/api/foreignMapData")
  .then((response) => response.json())
  .then((data) => {
    console.log("foreignMapData:: ", data);
    foreignMapData = data;
    
    drawForeignMap();
  })
}

  function drawForeignMap() {
    foreignMapData.forEach((element) => {
      console.log("element", element[2].replaceAll("'", '"'));
      const mapSelection = JSON.parse(element[2].replaceAll("'", '"'));
      console.log("mapSelection", mapSelection);
      for (const cell of mapSelection) {
        console.log("cell", cell);
        const rect = document.getElementById(cell);
        rect.classList.add("selected-rect");
        rect.setAttribute("fill", "rgba(200, 30, 0, 0.3)");
        usedCells.push(cell);
      }
    });
  }