statusText = "<h3>Übersicht aller Stände</h3>";

bigDiv = document.getElementById("inner-grid");
function init() {
  window.addEventListener("mouseup", function () {});
  window.addEventListener("mousedown", function () {});
  window.addEventListener("mousemove", function () {});

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
var infoTemplate = `
Lehrer: |teacher| <br>
Klasse: |class| <br>
Standname: |name| <br>
Beschreibung: |description| <br>
<br>
Checkboxen: 
|checked_boxes|
`;

var allowedToDraw = false;
var allowedToDrag = false;
var blacklistCells = [];
var selectedCells = [];
var currentSelectedCellClass = "";
var currentSelectedUID = "";

var rows;
var cols;
var gap;
var borderRadius;
var svg;
var mode = "";
var isMouseDown = false;
var standCount = 0;
var dragData = {
  active: false,
  offsetX: [],
  offsetY: [],
  className: "",
  rects: [],
  svg: null,
};

function setup() {
  // listeners
  document
    .getElementById("blackListBtnToggle")
    .addEventListener("click", configureBlacklistCells);

  document
    .getElementById("draggableBtnToggle")
    .addEventListener("click", enableDraggableCells);

  document
    .getElementById("resizeBtnToggle")
    .addEventListener("click", enableResizeCells);

  window.addEventListener("mouseup", function () {
    isMouseDown = false;
  });

  var svg = document.getElementById("svgCanvas");
  var blackListBtnToggle = document.getElementById("blackListBtnToggle");
  var draggableBtnToggle = document.getElementById("draggableBtnToggle");
  var resizeBtnToggle = document.getElementById("resizeBtnToggle");
  var resetBtn = document.getElementById("resetBtn");
  resetBtnActive = false;

  // reset button
  blackListBtnToggle.addEventListener("click", function () {
    if (resetBtnActive) {
      draggableBtnToggle.style.display = "initial";
      resizeBtnToggle.style.display = "initial";
      resetBtnActive = false;
      resetBtn.style.display = "none";
    } else {
      draggableBtnToggle.style.display = "none";
      resizeBtnToggle.style.display = "none";
      resetBtnActive = true;
      resetBtn.style.display = "initial";
      resetBtn.textContent = "Aktion abbrechen";
    }
  });
  draggableBtnToggle.addEventListener("click", function () {
    if (resetBtnActive) {
      blackListBtnToggle.style.display = "initial";
      resizeBtnToggle.style.display = "initial";
      resetBtnActive = false;
      resetBtn.style.display = "none";
    } else {
      blackListBtnToggle.style.display = "none";
      resizeBtnToggle.style.display = "none";
      resetBtnActive = true;
      resetBtn.style.display = "initial";
      resetBtn.textContent = "Aktion abbrechen";
    }
  });
  resizeBtnToggle.addEventListener("click", function () {
    if (resetBtnActive) {
      blackListBtnToggle.style.display = "initial";
      draggableBtnToggle.style.display = "initial";

      resetBtnActive = false;
      resetBtn.style.display = "none";
    } else {
      blackListBtnToggle.style.display = "none";
      draggableBtnToggle.style.display = "none";

      resetBtnActive = true;
      resetBtn.style.display = "initial";
      resetBtn.textContent = "Aktion abbrechen";

      document
        .querySelectorAll(
          `rect[class*="foreign-rect-${currentSelectedCellClass}"]`
        )
        .forEach((rect) => {
          selectedCells.push(rect.id);
          rect.style.opacity = "1";
        });
    }
  });

  // get blacklisted cells from server
  fetch("/admin/api/currentBlacklistCells")
    .then((response) => response.json())
    .then((data) => {
      blacklistCells = data;
      drawGrid();
    });

  function drawGrid(rowsP = 29, colsP = 40, gapP = 5, borderRadiusP = 10) {
    //33 40
    rows = rowsP;
    cols = colsP;
    gap = gapP;
    borderRadius = borderRadiusP;

    // create the grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        drawRect(col, row);
      }
    }

    // draw the existing stands
    fetch("/admin/api/foreignMapData")
      .then((response) => response.json())
      .then((foreignMapData) => {
        standCount = foreignMapData.length;
        drawForeignMap(foreignMapData);
      });
  }

  function drawForeignMap(foreignMapDataP) {
    console.log("foreignMapDataP", foreignMapDataP);
    foreignMapDataP.forEach((element) => {
      try {
        const uID = element[0];
        const mapSelection = JSON.parse(element[2].replaceAll("'", '"'));
        for (const cell of mapSelection) {
          const rect = document.getElementById(cell);
          rect.classList.add("selected-rect");
          rect.classList.add(`foreign-rect-${colorGenerator.getCounter()}`);
          rect.classList.add(`uid-${uID}`);
          rect.setAttribute("fill", colorGenerator.getColor());
        }
        colorGenerator.nextColor();
      } catch (error) {
        console.log("Error parsing foreignMapData:", error);
      }
    });
    makeRectsDraggable();
  }

  function makeRectsDraggable() {
    document
      .querySelectorAll('rect[class*="foreign-rect-"]')
      .forEach((rect) => {
        rect.style.opacity = "1";
        rect.classList.remove("blacklist-rect");

        addRectEventListeners(rect);
      });

    document.addEventListener("mousemove", (e) => {
      if (!dragData.active || !allowedToDrag) return;
      const mousePos = getMousePosition(e, svg);

      dragData.rects.forEach((r, index) => {
        const newX = mousePos.x - dragData.offsetX[index];
        const newY = mousePos.y - dragData.offsetY[index];
        r.setAttribute("x", newX);
        r.setAttribute("y", newY);
      });
    });

    document.addEventListener("mouseup", () => {
      if (!dragData.active) return;
      if (allowedToDrag == false) {
        return;
      }
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

        r.id = cellId;
        r.style.opacity = "1";
      });

      dragData.active = false;
      dragData.rects = [];
      dragData.offsetX = [];
      dragData.offsetY = [];
    });
  }

  //button action 1
  function configureBlacklistCells() {
    if (blackListBtnToggle.textContent === "Speichern") {
      blackListBtnToggle.textContent = "Zellen ausblenden";

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
    allowedToDraw = true;
    blackListBtnToggle.textContent = "Speichern";
    blacklistCells.forEach((cell) => {
      const rect = document.getElementById(cell);
      rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
      rect.style.opacity = "0.8";
    });
  }

  //button action 2
  function enableDraggableCells() {
    if (draggableBtnToggle.textContent === "Speichern") {
      console.log("Speichern");
      console.log("draggableBtnToggle", draggableBtnToggle);
      draggableBtnToggle.textContent = "Stände verschieben";
      allowedToDrag = false;
      const selectedRects = document.querySelectorAll('rect[class*="uid-"]');
      collection = [];

      selectedRects.forEach((rect) => {
        rect.style.cursor = "default";
        const classList = Array.from(rect.classList);
        const uidClass = classList.find((cls) => cls.startsWith("uid-"));
        const id = uidClass?.split("-")[1];
        collection.push({
          id: rect.id,
          uid: id,
        });
      });
      console.log(collection);

      mode = "";
      sendNewStandPositions(collection);
      return;
    }
    draggableBtnToggle.textContent = "Speichern";
    document
      .querySelectorAll('rect[class*="foreign-rect-"]')
      .forEach((rect) => {
        rect.style.cursor = "grabbing";
      });
    allowedToDrag = true;
  }

  //button action 3
  function enableResizeCells() {
    if (resizeBtnToggle.textContent === "Speichern") {
      resizeBtnToggle.textContent = "Standgröße bearbeiten";
      currentSelectedCellClass = "";
      selectedCells = [];
      allowedToDraw = false;
      mode = "";
      const selectedRects = document.querySelectorAll('rect[class*="uid-"]');
      collection = [];

      selectedRects.forEach((rect) => {
        rect.style.cursor = "default";
        const classList = Array.from(rect.classList);
        const uidClass = classList.find((cls) => cls.startsWith("uid-"));
        const id = uidClass?.split("-")[1];
        collection.push({
          id: rect.id,
          uid: id,
        });
      });
      sendNewStandPositions(collection);

      document
        .querySelectorAll('rect[class*="foreign-rect-"]')
        .forEach((rect) => {
          rect.style.opacity = "1";
        });
      //location.reload(); // not a very elegant solution...
    } else {
      resizeBtnToggle.textContent = "Speichern";
      allowedToDraw = true;
      mode = "changeStandSize";
      document
        .querySelectorAll('rect[class*="foreign-rect-"]')
        .forEach((rect) => {
          rect.style.opacity = "0.5";
        });
    }
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

  function sendNewStandPositions(data) {
    fetch("/admin/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "standPositionsUpdate",
        value: JSON.stringify(data),
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
    let totalColors = 20;

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

      return `rgba(${f(0)}, ${f(8)}, ${f(4)}, 0.7)`;
    }

    function getColor() {
      totalColors = standCount;
      const hue = (counter % totalColors) * (360 / totalColors);
      return hslToRgb(hue, 90, 60);
    }
    function getColorByIndex(index) {
      totalColors = standCount;
      const hue = (index % totalColors) * (360 / totalColors);
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
      getColorByIndex,
    };
  })();

  function getMousePosition(evt, svg) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
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
      isMouseDown = true;
      console.log(`Mouse down on cell at row ${row}, col ${col}`);
      if (mode === "blacklist") {
        if (blacklistCells.includes(`cell-${row}-${col}`)) {
          blacklistCells = blacklistCells.filter(
            (cell) => cell !== `cell-${row}-${col}`
          );
          rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
        } else {
          blacklistCells.push(`cell-${row}-${col}`);
          rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
        }
      } else if (mode === "changeStandSize") {
        const rectClass = Array.from(rect.classList).find((cls) =>
          cls.startsWith("foreign-rect-")
        );

        if (
          rectClass &&
          currentSelectedCellClass != "" &&
          rectClass != "foreign-rect-" + currentSelectedCellClass
        ) {
          console.warn(
            "Rect already has a different class, cannot change size"
          );
          console.warn("rectClass", rectClass);
          console.warn("currentSelectedCellClass", currentSelectedCellClass);
          return;
        }
        if (rectClass && currentSelectedCellClass === rectClass.split("-")[2]) {
          console.warn("Rect already has the current selected class", rect);
          rect.style.opacity = "1";
          selectedCells = selectedCells.filter(
            (id) => id !== `cell-${row}-${col}`
          );
          rect.classList.remove("selected-rect");
          rect.classList.remove(`foreign-rect-${currentSelectedCellClass}`);
          rect.classList.remove(`uid-${currentSelectedUID.split("-")[1]}`);
          rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
          
 // remove event listeners
          const clone = rect.cloneNode(true);
          rect.parentNode.replaceChild(clone, rect);

          return;
        }
        if (!rectClass && currentSelectedCellClass === "") {
          console.warn("No uid class found on rect", rect);
          return;
        }
        // else if (rectClass === currentSelectedCellClass && (Array.from(rect.classList).some((cls) => cls.startsWith("foreign-rect-")))) {
        // console.warn("Rect already has the current selected class", rect);
        // }
        else if (rectClass && currentSelectedCellClass === "") {
          currentSelectedCellClass = rectClass.split("-")[2];
          document
            .querySelectorAll(
              `rect[class*="foreign-rect-${currentSelectedCellClass}"]`
            )
            .forEach((rect) => {
              selectedCells.push(rect.id);
              rect.style.opacity = "1";
            });
          currentSelectedUID = Array.from(rect.classList).find((cls) =>
            cls.startsWith("uid-")
          );

          console.log("currentSelectedCellClass", currentSelectedCellClass);
        } else if (currentSelectedCellClass !== "") {
          selectedCells.push(`cell-${row}-${col}`);
          rect.classList.add(`foreign-rect-${currentSelectedCellClass}`);
          rect.classList.add(`uid-${currentSelectedUID.split("-")[1]}`);
          rect.classList.add("selected-rect");
          colorGenerator.getColorByIndex(currentSelectedCellClass);
          rect.setAttribute(
            "fill",
            colorGenerator.getColorByIndex(currentSelectedCellClass)
          );
          rect.style.opacity = "1";
          addRectEventListeners(rect);

        }
      }
    });

    // Wenn die Maus über das Kästchen fährt und die Maustaste gedrückt ist
    rect.addEventListener("mouseover", function () {
      if (!allowedToDraw) {
        return;
      }
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

function addRectEventListeners(rect) {
  rect.addEventListener("mousedown", (e) => {
    // get information about the stand
    const uidClass = Array.from(rect.classList).find((cls) =>
      cls.startsWith("uid-")
    );
    if (!uidClass) {
      console.warn("No uid class found on rect", rect);
    }

    uid = uidClass?.split("-")[1];
    var cellData = data.completed.find((item) => item.id == uid);
    if (!cellData) {
      cellData = data.pending.find((item) => item.id == uid);
    }
    if (!cellData) {
      console.warn("No cell data found for ", uidClass);
      return;
    }
    console.log("cellData", cellData);

    checked_boxes = cellData.question_ids;
    let checked_Boxes_string = "<ul>";
    for (const box of checked_boxes) {
      checked_Boxes_string += `<li>${questionIdLookup[box]}</li>`;
    }
    checked_Boxes_string += "</ul>";
      var standInfo = document.getElementById("standList");

    standInfo.innerHTML = infoTemplate
      .replace("|teacher|", cellData.lehrer || "Unbekannt")
      .replace("|class|", cellData.klasse || "Unbekannt")
      .replace("|description|", cellData.beschreibung || "Keine Beschreibung")
      .replace(
        "|checked_boxes|",
        checked_Boxes_string || "Keine Checkboxen ausgewählt"
      )
      .replace("|name|", cellData.titel || "Unbekannt");

    document.getElementById("resizeBtnToggleDiv").style.display = "flex";

    const rectClass = Array.from(rect.classList).find((cls) =>
      cls.startsWith("foreign-rect-")
    );
    currentSelectedCellClass = rectClass.split("-")[2];

    currentSelectedUID = Array.from(rect.classList).find((cls) =>
      cls.startsWith("uid-")
    );

    if (currentSelectedCellClass != "") {
      document
        .querySelectorAll(`rect[class*="foreign-rect-"]`)
        .forEach((rect) => {
          selectedCells.push(rect.id);
          rect.style.opacity = "0.7";
        });

      document
        .querySelectorAll(
          `rect[class*="foreign-rect-${currentSelectedCellClass}"]`
        )
        .forEach((rect) => {
          selectedCells.push(rect.id);
          rect.style.opacity = "1";
        });
    }

    if (allowedToDrag == false) {
      return;
    }
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
      if (document.querySelectorAll(`[id="${existingCellId}"]`).length <= 1) {
        drawRect(cellX, cellY);
      }
    });

    dragData.className = classList;
    dragData.active = true;
  });
}



}

