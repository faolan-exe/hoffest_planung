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
var blacklistCells = [];

var rows;
var cols;
var gap;
var borderRadius;

function setup() {
  document
    .getElementById("blackListBtnToggle")
    .addEventListener("click", configureBlacklistCells);

  var svg = document.getElementById("svgCanvas");
  let isMouseDown = false;
  usedCells = [];

  var mode = "";
  fetch("/admin/api/currentBlacklistCells")
    .then((response) => response.json())
    .then((data) => {
      console.log("blacklistCells:: ", data);
      blacklistCells = data;
      drawGrid();
      fetch("/admin/api/foreignMapData")
        .then((response) => response.json())
        .then((data) => {
          console.log("foreignMapData:: ", data);
          foreignMapData = data;

          drawForeignMap();
        });
    });

  function drawGrid(rowsP = 33, colsP = 40, gapP = 5, borderRadiusP = 10) {
    rows = rowsP;
    cols = colsP;
    gap = gapP;
    borderRadius = borderRadiusP;
    const oldRects = svg.querySelectorAll("rect");

    oldRects.forEach((rect) => rect.remove());

    window.addEventListener("mouseup", function () {
      isMouseDown = false;
    });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        drawRect(col, row);
      }
    }
  }
  function drawForeignMap() {
    foreignMapData.forEach((element) => {
      try {
        console.log("element", element[2].replaceAll("'", '"'));
        const mapSelection = JSON.parse(element[2].replaceAll("'", '"'));
        console.log("mapSelection", mapSelection);
        for (const cell of mapSelection) {
          console.log("cell", cell);
          const rect = document.getElementById(cell);
          rect.classList.add("selected-rect");
          rect.classList.add(`foreign-rect-${colorGenerator.getCounter()}`);
          rect.setAttribute("fill", colorGenerator.getColor());
          usedCells.push(cell);
        }
        colorGenerator.nextColor();
      } catch (error) {
        console.log("Error parsing foreignMapData:", error);
      }
    });
    makeRectsDraggable();
  }

  function configureBlacklistCells() {
    if (
      document.getElementById("blackListBtnToggle").textContent === "Speichern"
    ) {
      document.getElementById("blackListBtnToggle").textContent =
        "Zellen ausblenden";

      blacklistCells.forEach((cell) => {
        const rect = document.getElementById(cell);
        rect.classList.add("blacklist-rect");
        rect.style.opacity = "0";
      });
      allowedToDraw = false;
      mode = "";
      sendNewBlacklistCells();
      return;
    }

    mode = "blacklist";
    selectedCells = [];
    allowedToDraw = true;
    document.getElementById("blackListBtnToggle").textContent = "Speichern";
    blacklistCells.forEach((cell) => {
      const rect = document.getElementById(cell);
      rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
      rect.style.opacity = "0.8";
    });
  }

  function sendNewBlacklistCells() {
    fetch("/admin/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "blacklistCellsUpdate",
        value: JSON.stringify(blacklistCells),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Success:", data);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }

  const colorGenerator = (function () {
    let counter = 0;
    const totalColors = 20; //TODO: introduce global STAND_COUNT variable

    function hslToRgb(h, s, l) {
      s /= 100;
      l /= 100;
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) =>
        Math.round(
          255 *
            (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
        );
      return `rgb(${f(0)}, ${f(8)}, ${f(4)}, 0.3)`;
    }

    function getColor() {
      const hue = (counter % totalColors) * (360 / totalColors);
      return hslToRgb(hue, 90, 60);
    }

    function nextColor() {
      counter++;
    }

    function getCounter() {
      return counter;
    }

    return {
      getColor,
      nextColor,
      getCounter,
    };
  })();

  let dragData = {
    active: false,
    offsetX: [],
    offsetY: [],
    className: "",
    rects: [],
    svg: null,
  };

  function getMousePosition(evt, svg) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function makeRectsDraggable() {
    const svg = document.querySelector("svg");
    dragData.svg = svg;

    document
      .querySelectorAll('rect[class*="foreign-rect-"]')
      .forEach((rect) => {
        rect.addEventListener("mousedown", (e) => {
          const classList = Array.from(rect.classList).find((cls) =>
            cls.startsWith("foreign-rect-")
          );
          if (!classList) return;
          const mousePos = getMousePosition(e, svg);
          dragData.rects = [];
          dragData.offsetX = [];
          dragData.offsetY = [];

          document.querySelectorAll(`rect.${classList}`).forEach((r) => {
            const x = parseFloat(r.getAttribute("x") || "0");
            const y = parseFloat(r.getAttribute("y") || "0");

            dragData.rects.push(r);
            dragData.offsetX.push(mousePos.x - x);
            dragData.offsetY.push(mousePos.y - y);

            r.style.cursor = "grabbing";
            r.style.opacity = "0.8";
            const viewBox = svg.viewBox.baseVal;
            const totalWidth = viewBox.width;
            const totalHeight = viewBox.height;

            const cellWidth = (totalWidth - (cols + 1) * gap) / cols;
            const cellHeight = (totalHeight - (rows + 1) * gap) / rows;

            cellX = Math.round(
              (snapToGrid(x, cellWidth, gap) - gap) / (cellWidth + gap)
            );
            cellY = Math.round(
              (snapToGrid(y, cellHeight, gap) - gap) / (cellHeight + gap)
            );
            existingCellId = `cell-${cellY}-${cellX}`;
            const el = document.getElementById(existingCellId);
            //if (!el.classList.contains("selected-rect")) {
            if (document.querySelectorAll(`[id="${existingCellId}"]`).length <= 1) {
              drawRect(cellX, cellY);
            }
            //}
          });

          dragData.className = classList;
          dragData.active = true;
        });
      });

    document.addEventListener("mousemove", (e) => {
      if (!dragData.active) return;
      const mousePos = getMousePosition(e, dragData.svg);

      dragData.rects.forEach((r, index) => {
        const newX = mousePos.x - dragData.offsetX[index];
        const newY = mousePos.y - dragData.offsetY[index];
        r.setAttribute("x", newX);
        r.setAttribute("y", newY);
      });
    });

    document.addEventListener("mouseup", () => {
      if (!dragData.active) return;
      dragData.rects.forEach((r) => {
        const x = parseFloat(r.getAttribute("x"));
        const y = parseFloat(r.getAttribute("y"));

        const viewBox = svg.viewBox.baseVal;
        const totalWidth = viewBox.width;
        const totalHeight = viewBox.height;
        const cellWidth = (totalWidth - (cols + 1) * gap) / cols;
        const cellHeight = (totalHeight - (rows + 1) * gap) / rows;

        const snappedX = snapToGrid(x, cellWidth, gap);
        const snappedY = snapToGrid(y, cellHeight, gap);

        r.setAttribute("x", snappedX);
        r.setAttribute("y", snappedY);

        const col = Math.round((snappedX - gap) / (cellWidth + gap));
        const row = Math.round((snappedY - gap) / (cellHeight + gap));

        const cellId = `cell-${row}-${col}`;
        document.querySelectorAll(`[id=${cellId}]`).forEach((el) => {
          if (el && !el.classList.contains("selected-rect")) el.remove();
        });

        // const el = document.getElementById(cellId);
        //   if (el && !el.classList.contains("selected-rect")) el.remove();

        r.id = cellId;

        r.style.cursor = "pointer";
        r.style.opacity = "1";
      });

      dragData.active = false;
      dragData.rects = [];
      dragData.offsetX = [];
      dragData.offsetY = [];
    });
  }

  function snapToGrid(value, size, gap) {
    return gap + Math.round((value - gap) / (size + gap)) * (size + gap);
  }

  function drawRect(col, row) {
    const viewBox = svg.viewBox.baseVal;
    const totalWidth = viewBox.width;
    const totalHeight = viewBox.height;

    const cellWidth = (totalWidth - (cols + 1) * gap) / cols;
    const cellHeight = (totalHeight - (rows + 1) * gap) / rows;
    const x = gap + col * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
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
      if (mode === "blacklist") {
        isMouseDown = true;
        console.log(`Mouse down on cell at row ${row}, col ${col}`);
        if (blacklistCells.includes(`cell-${row}-${col}`)) {
          blacklistCells = blacklistCells.filter(
            (cell) => cell !== `cell-${row}-${col}`
          );
          rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
        } else {
          blacklistCells.push(`cell-${row}-${col}`);
          rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
        }
      }
    });

    // Wenn die Maus über das Kästchen fährt und die Maustaste gedrückt ist
    rect.addEventListener("mouseover", function () {
      if (mode === "blacklist") {
        if (isMouseDown && !blacklistCells.includes(`cell-${row}-${col}`)) {
          if (blacklistCells.includes(`cell-${row}-${col}`)) {
            blacklistCells = blacklistCells.filter(
              (cell) => cell !== `cell-${row}-${col}`
            );
            rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
          } else {
            blacklistCells.push(`cell-${row}-${col}`);
            rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
          }
        }
      }
    });
    svg.appendChild(rect);

    if (blacklistCells.includes(`cell-${row}-${col}`)) {
      rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
      if (mode !== "blacklist") {
        rect.style.opacity = "0";
        rect.classList.add("blacklist-rect");
      }
    }
  }
}
