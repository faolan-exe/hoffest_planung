// ─────────────────────────────────────────────────────────────────────────────
// Constants & Templates
// ─────────────────────────────────────────────────────────────────────────────

var GRID_ROWS = 29;
var GRID_COLS = 40;
var GRID_GAP = 5;
var GRID_BORDER_RADIUS = 10;

var STATUS_TEXT = "<h3>Übersicht aller Stände</h3>";

var STAND_INFO_TEMPLATE = `
Lehrer: |teacher| <br>
Klasse: |class| <br>
Standname: |name| <br>
Beschreibung: |description| <br>
<br>
Checkboxen:
|checked_boxes|
`;


// ─────────────────────────────────────────────────────────────────────────────
// Mutable State
// ─────────────────────────────────────────────────────────────────────────────

var currentYear = new Date().getFullYear();

var blacklistCells = [];
var socketList = [];
var selectedCells = [];
var arrayCopy = [];

var allowedToDraw = false;
var allowedToDrag = false;
var isMouseDown = false;
var resetBtnActive = false;

var mode = "";
var currentSelectedCellClass = "";
var currentSelectedUID = "";

var standCount = 0;

var yearMapData = null;
var yearStandDetails = null;
var yearFetchInProgress = false;

var rows = GRID_ROWS;
var cols = GRID_COLS;
var gap = GRID_GAP;
var borderRadius = GRID_BORDER_RADIUS;

/** @type {SVGSVGElement} */
var svg;

var dragData = {
  active: false,
  offsetX: [],
  offsetY: [],
  className: "",
  rects: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

var bigDiv = document.getElementById("inner-grid");

function init() {
  bigDiv.innerHTML = '<div class="spacer" id="heading">ERROR</div>';
  document.getElementById("status-text").innerHTML = STATUS_TEXT;

  fetch("/admin/loader/overview.html")
    .then((response) => response.text())
    .then((html) => {
      bigDiv.innerHTML = html;
      setup();
    })
    .catch((err) => console.error("Failed to load overview:", err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup – called once the overview HTML is injected
// ─────────────────────────────────────────────────────────────────────────────

function setup() {
  svg = document.getElementById("svgCanvas");

  const blacklistBtn = document.getElementById("blackListBtnToggle");
  const draggableBtn = document.getElementById("draggableBtnToggle");
  const socketBtn = document.getElementById("socketMarkerBtnToggle");
  const resizeBtn = document.getElementById("resizeBtnToggle");
  const resetBtn = document.getElementById("resetBtn");
  const yearBtn = document.getElementById("jahr-filter");

  (() => {
    const sel = document.getElementById('jahr-filter');
    const current = new Date().getFullYear();
    for (let j = current; j >= 2025; j--) {
      const opt = document.createElement('option');
      opt.value = j;
      opt.textContent = j;
      if (j === currentYear) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', (e) => {
      switchYear(parseInt(e.target.value, 10));
    });
  })();

  registerGlobalMouseListeners();
  registerToolbarListeners({
    blacklistBtn,
    draggableBtn,
    socketBtn,
    resizeBtn,
    resetBtn,
    yearBtn,
  });

  loadInitialData();
}

// ─────────────────────────────────────────────────────────────────────────────
// Year Switching
// ─────────────────────────────────────────────────────────────────────────────

function switchYear(newYear) {
  currentYear = newYear;
  yearMapData = null;
  yearStandDetails = null;
  yearFetchInProgress = false;
  selectedCells = [];
  currentSelectedCellClass = "";
  currentSelectedUID = "";
  arrayCopy = [];
  mode = "";
  colorGenerator.reset();

  document.getElementById("standList").innerHTML =
    '<p style="color:#718096;margin:0;">Bitte wähle einen Stand aus der Liste oder der Karte…</p>';
  document.getElementById("resizeBtnToggleDiv").style.display = "none";

  drawGrid();
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Mouse Tracking
// ─────────────────────────────────────────────────────────────────────────────

function registerGlobalMouseListeners() {
  window.addEventListener("mouseup", () => {
    isMouseDown = false;
  });
  window.addEventListener("mousedown", () => {});
  window.addEventListener("mousemove", () => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar Button Logic
// ─────────────────────────────────────────────────────────────────────────────

function enterToolMode(allBtns, activBtn, resetBtn) {
  allBtns.forEach((btn) => {
    btn.style.display = btn === activBtn ? "initial" : "none";
  });
  resetBtnActive = true;
  resetBtn.style.display = "initial";
  resetBtn.textContent = "Aktion abbrechen";
}

function exitToolMode(allBtns, resetBtn) {
  allBtns.forEach((btn) => {
    btn.style.display = "initial";
  });
  resetBtnActive = false;
  resetBtn.style.display = "none";
}

function registerToolbarListeners({
  blacklistBtn,
  draggableBtn,
  socketBtn,
  resizeBtn,
  resetBtn,
  yearBtn,
}) {
  const allBtns = [blacklistBtn, draggableBtn, socketBtn, resizeBtn, yearBtn];

  resetBtn.addEventListener("click", () => {
    mode = "";
    allowedToDraw = false;

    exitToolMode(allBtns, resetBtn);

    if (blacklistBtn.textContent === "Speichern") {
      blacklistCells = [...arrayCopy];
      blacklistBtn.textContent = "Zellen ausblenden";
    }
    if (draggableBtn.textContent === "Speichern") {
      draggableBtn.textContent = "Stände verschieben";
    }
    if (socketBtn.textContent === "Speichern") {
      socketList = [...arrayCopy];
      socketBtn.textContent = "Steckdosen einzeichnen";
    }
    if (resizeBtn.textContent === "Speichern") {
      resizeBtn.textContent = "Standgröße bearbeiten";
    }

    drawGrid();
  });

  blacklistBtn.addEventListener("click", () => {
    if (resetBtnActive) {
      exitToolMode(allBtns, resetBtn);
    } else {
      enterToolMode(allBtns, blacklistBtn, resetBtn);
    }
  });
  blacklistBtn.addEventListener("click", configureBlacklistCells);

  socketBtn.addEventListener("click", () => {
    if (resetBtnActive) {
      exitToolMode(allBtns, resetBtn);
    } else {
      enterToolMode(allBtns, socketBtn, resetBtn);
    }
  });
  socketBtn.addEventListener("click", enableSocketMarker);

  draggableBtn.addEventListener("click", () => {
    if (resetBtnActive) {
      exitToolMode(allBtns, resetBtn);
    } else {
      enterToolMode(allBtns, draggableBtn, resetBtn);
    }
  });
  draggableBtn.addEventListener("click", enableDraggableCells);

  resizeBtn.addEventListener("click", () => {
    if (resetBtnActive) {
      exitToolMode(allBtns, resetBtn);
    } else {
      enterToolMode(allBtns, resizeBtn, resetBtn);
    }
  });
  resizeBtn.addEventListener("click", enableResizeCells);
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial Data Load
// ─────────────────────────────────────────────────────────────────────────────

function loadInitialData() {
  fetch("/admin/api/currentBlacklistCells")
    .then((r) => r.json())
    .then((data) => {
      blacklistCells = data;
      return fetch("/admin/api/currentSocketCells");
    })
    .then((r) => r.json())
    .then((data) => {
      socketList = data;
      drawGrid();
    })
    .catch((err) => console.error("Failed to load initial data:", err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid Drawing
// ─────────────────────────────────────────────────────────────────────────────

function drawGrid(
  rowsP = GRID_ROWS,
  colsP = GRID_COLS,
  gapP = GRID_GAP,
  borderRadiusP = GRID_BORDER_RADIUS,
) {
  rows = rowsP;
  cols = colsP;
  gap = gapP;
  borderRadius = borderRadiusP;

  svg.innerHTML = `
    <defs>
      <pattern id="pending-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(0,0,0,0.30)" stroke-width="4"/>
      </pattern>
    </defs>
    <image
      href="/static/plan.jpg"
      width="100%"
      style="pointer-events: none"
      preserveAspectRatio="xMinYMin meet"
      id="svgImage">
    </image>
  `;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      drawRect(col, row);
    }
  }

  if (yearMapData !== null && yearStandDetails !== null) {
    colorGenerator.reset();
    drawForeignMap(yearMapData);
    return;
  }

  if (yearFetchInProgress) return;
  yearFetchInProgress = true;

  Promise.all([
    fetch("/admin/api/foreignMapData/" + currentYear).then((r) => r.json()),
    fetch("/admin/api/standDetails/" + currentYear).then((r) => r.json()),
  ])
    .then(([mapData, standDetails]) => {
      yearFetchInProgress = false;
      yearMapData = mapData || [];
      yearStandDetails = standDetails || {pending: [], completed: []};
      standCount = yearMapData.length;
      drawForeignMap(yearMapData);
    })
    .catch((err) => {
      yearFetchInProgress = false;
      console.error("Failed to load year data:", err);
    });
}

function drawForeignMap(foreignMapData) {
  const pendingIds = new Set((yearStandDetails?.pending ?? []).map(s => String(s.id)));

  foreignMapData.forEach((element) => {
    try {
      const uID = element[0];
      const mapSelection = element[2];

      if (mapSelection === "none") return;

      const cells = JSON.parse(mapSelection.replaceAll("'", '"'));
      const colorIndex = colorGenerator.getCounter();
      const isPending = pendingIds.has(String(uID));

      cells.forEach((cellId) => {
        const rect = document.getElementById(cellId);
        if (!rect) return;

        rect.classList.add("selected-rect");
        rect.classList.add(`foreign-rect-${colorIndex}`);
        rect.classList.add(`uid-${uID}`);
        rect.setAttribute("fill", element[3]);

        if (isPending) {
          rect.style.opacity = "0.6";
          const hatch = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          ["x", "y", "width", "height", "rx", "ry"].forEach(a => hatch.setAttribute(a, rect.getAttribute(a)));
          hatch.setAttribute("fill", "url(#pending-hatch)");
          hatch.setAttribute("pointer-events", "none");
          svg.appendChild(hatch);
        }
      });

      colorGenerator.nextColor();
    } catch (error) {
      console.error("Error parsing foreignMapData entry:", error);
    }
  });

  makeForeignRectsDraggable();
  populateStandList(foreignMapData, yearStandDetails);
}

function selectStandOnMap(uid) {
  const rect = document.querySelector(`rect.uid-${uid}`);
  if (!rect) return;

  const rectClass = Array.from(rect.classList).find((cls) =>
    cls.startsWith("foreign-rect-"),
  );
  if (!rectClass) return;

  currentSelectedCellClass = rectClass.split("-")[2];
  currentSelectedUID = `uid-${uid}`;

  highlightStand(rectClass);

  const cellData = findStandById(uid);
  if (cellData) showStandInfo(cellData);

  document.getElementById("resizeBtnToggleDiv").style.display = "flex";
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag Support
// ─────────────────────────────────────────────────────────────────────────────

function makeForeignRectsDraggable() {
  document.querySelectorAll('rect[class*="foreign-rect-"]').forEach((rect) => {
    rect.style.opacity = "1";
    rect.classList.remove("blacklist-rect");
    addForeignRectEventListeners(rect);
  });

  document.addEventListener("mousemove", onDragMouseMove);
  document.addEventListener("mouseup", onDragMouseUp);
}

function onDragMouseMove(e) {
  if (!dragData.active || !allowedToDrag) return;

  const mousePos = getMousePosition(e, svg);

  dragData.rects.forEach((rect, index) => {
    rect.setAttribute("x", mousePos.x - dragData.offsetX[index]);
    rect.setAttribute("y", mousePos.y - dragData.offsetY[index]);
  });
}

function onDragMouseUp() {
  if (!dragData.active || !allowedToDrag) return;

  const viewBox = svg.viewBox.baseVal;
  const cellWidth = (viewBox.width - (cols + 1) * gap) / cols;
  const cellHeight = (viewBox.height - (rows + 1) * gap) / rows;

  dragData.rects.forEach((rect) => {
    const x = parseFloat(rect.getAttribute("x"));
    const y = parseFloat(rect.getAttribute("y"));

    const snappedX = snapToGrid(x, cellWidth, gap);
    const snappedY = snapToGrid(y, cellHeight, gap);

    rect.setAttribute("x", snappedX);
    rect.setAttribute("y", snappedY);
    rect.style.opacity = "1";

    const col = Math.round((snappedX - gap) / (cellWidth + gap));
    const row = Math.round((snappedY - gap) / (cellHeight + gap));
    const cellId = `cell-${row}-${col}`;

    document.querySelectorAll(`[id="${cellId}"]`).forEach((el) => {
      if (!el.classList.contains("selected-rect")) el.remove();
    });

    rect.id = cellId;
  });

  dragData.active = false;
  dragData.rects = [];
  dragData.offsetX = [];
  dragData.offsetY = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Actions
// ─────────────────────────────────────────────────────────────────────────────

function configureBlacklistCells() {
  const btn = document.getElementById("blackListBtnToggle");

  if (btn.textContent === "Speichern") {
    btn.textContent = "Zellen ausblenden";
    blacklistCells.forEach((cellId) => {
      document.getElementById(cellId)?.classList.add("blacklist-rect");
    });
    allowedToDraw = false;
    mode = "";
    sendNewBlacklistCells();
    drawGrid();
    return;
  }

  arrayCopy = [...blacklistCells];
  mode = "blacklist";
  allowedToDraw = true;
  btn.textContent = "Speichern";

  blacklistCells.forEach((cellId) => {
    const rect = document.getElementById(cellId);
    if (!rect) return;
    rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
    rect.style.opacity = "0.8";
  });
}

function enableDraggableCells() {
  const btn = document.getElementById("draggableBtnToggle");

  if (btn.textContent === "Speichern") {
    btn.textContent = "Stände verschieben";
    allowedToDrag = false;

    const collection = collectUIDPositions();
    mode = "";
    sendNewStandPositions(collection);
    return;
  }

  btn.textContent = "Speichern";
  document.querySelectorAll('rect[class*="foreign-rect-"]').forEach((rect) => {
    rect.style.cursor = "grabbing";
  });
  allowedToDrag = true;
}

function enableSocketMarker() {
  const btn = document.getElementById("socketMarkerBtnToggle");

  if (btn.textContent === "Speichern") {
    btn.textContent = "Steckdosen einzeichnen";
    socketList.forEach((cellId) => {
      document.getElementById(cellId)?.classList.add("socket-rect");
    });
    allowedToDraw = false;
    mode = "";
    sendNewSockets();
    drawGrid();
    return;
  }

  arrayCopy = [...socketList];
  mode = "socketMarker";
  allowedToDraw = true;
  btn.textContent = "Speichern";

  socketList.forEach((cellId) => {
    const rect = document.getElementById(cellId);
    if (!rect) return;
    rect.setAttribute("fill", "rgba(0, 204, 255, 0.8)");
    rect.style.opacity = "0.7";
  });
}

function enableResizeCells() {
  const btn = document.getElementById("resizeBtnToggle");

  if (btn.textContent === "Speichern") {
    btn.textContent = "Standgröße bearbeiten";
    currentSelectedCellClass = "";
    selectedCells = [];
    allowedToDraw = false;
    mode = "";

    const collection = collectUIDPositions();
    sendNewStandPositions(collection);

    document
      .querySelectorAll('rect[class*="foreign-rect-"]')
      .forEach((rect) => {
        rect.style.opacity = "1";
      });
    return;
  }

  btn.textContent = "Speichern";
  allowedToDraw = true;
  mode = "changeStandSize";

  document.querySelectorAll('rect[class*="foreign-rect-"]').forEach((rect) => {
    rect.style.opacity = "0.5";
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stand Selection & Info Panel
// ─────────────────────────────────────────────────────────────────────────────

function highlightStand(clickedCellClass) {
  document.querySelectorAll('rect[class*="foreign-rect-"]').forEach((rect) => {
    rect.style.opacity = "0.6";
    rect.setAttribute("stroke-width", "0");
  });

  tempRect = null;
  document.querySelectorAll(`rect.${clickedCellClass}`).forEach((rect) => {
    rect.style.opacity = "1";
    rect.setAttribute("stroke", "rgb(0, 0, 0)");
    rect.setAttribute("stroke-width", "2");
    if (!tempRect) tempRect = rect;
  });
  document.getElementById("stand_color").value =
    tempRect.getAttribute("fill") || "#000";
  document.getElementById("stand_color_label").style.borderColor =
    tempRect.getAttribute("fill") || "#000";
  document.getElementById("stand_color").onchange = function () {
    const newColor = this.value;
    document.querySelectorAll(`rect.${clickedCellClass}`).forEach((rect) => {
      rect.setAttribute("fill", newColor);
    });

    fetch("/admin/api/updateStandColor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: tempRect.classList.value.split(" ").find(cls => cls.startsWith("uid-")).split("-")[1],
        color: newColor
      }),
    }).then((r) => r.json())
      .then((data) => console.log(`Stand color update success:`, data))
      .catch((err) => console.error(`Stand color update error:`, err));
  };
}

function showStandInfo(cellData) {
  const checkedBoxes = cellData.question_ids ?? [];
  let checkedBoxesHTML = "<ul>";
  for (const boxId of checkedBoxes) {
    checkedBoxesHTML += `<li>${questionIdLookup[boxId]}</li>`;
  }
  checkedBoxesHTML += "</ul>";

  document.getElementById("standList").innerHTML = STAND_INFO_TEMPLATE.replace(
    "|teacher|",
    cellData.lehrer || "Unbekannt",
  )
    .replace("|class|", cellData.klasse || "Unbekannt")
    .replace("|description|", cellData.beschreibung || "Keine Beschreibung")
    .replace(
      "|checked_boxes|",
      checkedBoxesHTML || "Keine Checkboxen ausgewählt",
    )
    .replace("|name|", cellData.titel || "Unbekannt");

  document.getElementById("resizeBtnToggleDiv").style.display = "flex";

  const bestaendigCheckbox = document.getElementById("bestaendig_toggle");
  bestaendigCheckbox.checked = cellData.jahr === 0;
  bestaendigCheckbox.onchange = function () {
    const newJahr = this.checked ? 0 : currentYear;
    fetch("/admin/api/updateStandJahr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: cellData.id, jahr: newJahr }),
    })
      .then((r) => r.json())
      .then(() => {
        cellData.jahr = newJahr;
        yearMapData = null;
        yearStandDetails = null;
        yearFetchInProgress = false;
        colorGenerator.reset();
        drawGrid();
      })
      .catch((err) => console.error("Stand jahr update error:", err));
  };

  if (typeof setActiveStandCard === "function") {
    setActiveStandCard(cellData.id);

    const activeCard = document.querySelector(
      `.stand-card[data-uid="${cellData.id}"]`,
    );
    activeCard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Listener Factories
// ─────────────────────────────────────────────────────────────────────────────

function addForeignRectEventListeners(rect) {
  rect.addEventListener("mousedown", (e) => {
    const uidClass = Array.from(rect.classList).find((cls) =>
      cls.startsWith("uid-"),
    );
    if (!uidClass) {
      console.warn("No uid class found on rect", rect);
      return;
    }

    const uid = uidClass.split("-")[1];
    const cellData = findStandById(uid);
    if (!cellData) {
      console.warn(`No cell data found for uid-${uid}`);
      return;
    }

    showStandInfo(cellData);

    const rectClass = Array.from(rect.classList).find((cls) =>
      cls.startsWith("foreign-rect-"),
    );
    currentSelectedCellClass = rectClass?.split("-")[2] ?? "";
    currentSelectedUID = uidClass;

    highlightStand(rectClass);

    if (!allowedToDrag) return;
    if (!rectClass) return;

    const mousePos = getMousePosition(e, svg);

    dragData.rects = [];
    dragData.offsetX = [];
    dragData.offsetY = [];

    document.querySelectorAll(`rect.${rectClass}`).forEach((r) => {
      const x = parseFloat(r.getAttribute("x") || "0");
      const y = parseFloat(r.getAttribute("y") || "0");

      dragData.rects.push(r);
      dragData.offsetX.push(mousePos.x - x);
      dragData.offsetY.push(mousePos.y - y);
      r.style.opacity = "0.8";

      const viewBox = svg.viewBox.baseVal;
      const cellWidth = (viewBox.width - (cols + 1) * gap) / cols;
      const cellHeight = (viewBox.height - (rows + 1) * gap) / rows;
      const cellX = Math.round(
        (snapToGrid(x, cellWidth, gap) - gap) / (cellWidth + gap),
      );
      const cellY = Math.round(
        (snapToGrid(y, cellHeight, gap) - gap) / (cellHeight + gap),
      );
      const placeholderId = `cell-${cellY}-${cellX}`;

      if (document.querySelectorAll(`[id="${placeholderId}"]`).length <= 1) {
        drawRect(cellX, cellY);
      }
    });

    dragData.className = rectClass;
    dragData.active = true;
  });
}

function addDefaultRectEventListeners(rect, row, col) {
  const cellId = `cell-${row}-${col}`;

  rect.addEventListener("mousedown", () => {
    if (!allowedToDraw) return;

    isMouseDown = true;

    if (mode === "blacklist") {
      toggleBlacklistCell(rect, cellId);
    } else if (mode === "socketMarker") {
      toggleSocketCell(rect, cellId);
    } else if (mode === "changeStandSize") {
      handleResizeModeClick(rect, row, col, cellId);
    }
  });

  rect.addEventListener("mouseover", () => {
    if (!allowedToDraw || !isMouseDown) return;

    if (mode === "blacklist" && !blacklistCells.includes(cellId)) {
      blacklistCells.push(cellId);
      rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
    } else if (mode === "socketMarker" && !socketList.includes(cellId)) {
      socketList.push(cellId);
      rect.setAttribute("fill", "rgba(0, 204, 255, 0.8)");
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell Toggle Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toggleBlacklistCell(rect, cellId) {
  if (blacklistCells.includes(cellId)) {
    blacklistCells = blacklistCells.filter((id) => id !== cellId);
    rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
  } else {
    blacklistCells.push(cellId);
    rect.setAttribute("fill", "rgba(255, 0, 0, 0.8)");
  }
}

function toggleSocketCell(rect, cellId) {
  if (socketList.includes(cellId)) {
    socketList = socketList.filter((id) => id !== cellId);
    rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
  } else {
    socketList.push(cellId);
    rect.setAttribute("fill", "rgba(0, 204, 255, 0.8)");
  }
}

function handleResizeModeClick(rect, row, col, cellId) {
  const rectClass = Array.from(rect.classList).find((cls) =>
    cls.startsWith("foreign-rect-"),
  );

  if (
    rectClass &&
    currentSelectedCellClass !== "" &&
    rectClass !== `foreign-rect-${currentSelectedCellClass}`
  ) {
    console.warn("Cannot resize: rect belongs to a different stand.", {
      rectClass,
      currentSelectedCellClass,
    });
    return;
  }

  if (rectClass && currentSelectedCellClass === rectClass.split("-")[2]) {
    rect.style.opacity = "1";
    selectedCells = selectedCells.filter((id) => id !== cellId);
    rect.classList.remove(
      "selected-rect",
      `foreign-rect-${currentSelectedCellClass}`,
      `uid-${currentSelectedUID.split("-")[1]}`,
    );
    rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");

    const freshRect = rect.cloneNode(true);
    rect.parentNode.replaceChild(freshRect, rect);
    addDefaultRectEventListeners(freshRect, row, col);
    return;
  }

  if (!rectClass && currentSelectedCellClass === "") {
    console.warn("Resize mode: no stand selected yet, clicked an empty cell.");
    return;
  }

  if (rectClass && currentSelectedCellClass === "") {
    currentSelectedCellClass = rectClass.split("-")[2];
    currentSelectedUID =
      Array.from(rect.classList).find((cls) => cls.startsWith("uid-")) ?? "";

    document
      .querySelectorAll(`rect.foreign-rect-${currentSelectedCellClass}`)
      .forEach((r) => {
        selectedCells.push(r.id);
        r.style.opacity = "1";
      });
    return;
  }

  if (currentSelectedCellClass !== "") {
    selectedCells.push(cellId);
    rect.classList.add(
      `foreign-rect-${currentSelectedCellClass}`,
      `uid-${currentSelectedUID.split("-")[1]}`,
      "selected-rect",
    );
    rect.setAttribute(
      "fill",
      colorGenerator.getColorByIndex(Number(currentSelectedCellClass)),
    );
    rect.style.opacity = "1";
    addForeignRectEventListeners(rect);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing a Single Grid Cell
// ─────────────────────────────────────────────────────────────────────────────

function drawRect(col, row) {
  const viewBox = svg.viewBox.baseVal;
  const cellWidth = (viewBox.width - (cols + 1) * gap) / cols;
  const cellHeight = (viewBox.height - (rows + 1) * gap) / rows;
  const x = gap + col * (cellWidth + gap);
  const y = gap + row * (cellHeight + gap);
  const cellId = `cell-${row}-${col}`;

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", cellWidth);
  rect.setAttribute("height", cellHeight);
  rect.setAttribute("rx", borderRadius);
  rect.setAttribute("ry", borderRadius);
  rect.setAttribute("fill", "rgba(100, 0, 255, 0.1)");
  rect.setAttribute("id", cellId);

  if (socketList.includes(cellId)) {
    rect.setAttribute("stroke", "rgba(0, 204, 255, 1)");
    rect.setAttribute("stroke-width", "2");
  }
  if (blacklistCells.includes(cellId)) {
    rect.setAttribute("stroke", "rgba(255, 0, 0, 0.3)");
    rect.setAttribute("stroke-width", "2");
  }

  addDefaultRectEventListeners(rect, row, col);
  svg.appendChild(rect);
}

// ─────────────────────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────────────────────

function sendNewBlacklistCells() {
  postToAdminAPI("blacklistCellsUpdate", JSON.stringify(blacklistCells));
}

function sendNewSockets() {
  postToAdminAPI("socketCellsUpdate", JSON.stringify(socketList));
}

function sendNewStandPositions(data) {
  postToAdminAPI("standPositionsUpdate", JSON.stringify(data));
}

function postToAdminAPI(action, value) {
  fetch("/admin/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, value }),
  })
    .then((r) => r.json())
    .then((data) => console.log(`API success [${action}]:`, data))
    .catch((err) => console.error(`API error [${action}]:`, err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function getMousePosition(evt, svgEl) {
  const pt = svgEl.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

function snapToGrid(value, size, gapP) {
  return gapP + Math.round((value - gapP) / (size + gapP)) * (size + gapP);
}

function findStandById(uid) {
  if (!yearStandDetails) {
    console.error("findStandById: yearStandDetails not loaded yet.");
    return null;
  }
  return (
    yearStandDetails.completed?.find((item) => item.id == uid) ??
    yearStandDetails.pending?.find((item) => item.id == uid) ??
    null
  );
}

function collectUIDPositions() {
  const collection = [];
  document.querySelectorAll('rect[class*="uid-"]').forEach((rect) => {
    rect.style.cursor = "default";
    const uidClass = Array.from(rect.classList).find((cls) =>
      cls.startsWith("uid-"),
    );
    const uid = uidClass?.split("-")[1];
    collection.push({ id: rect.id, uid });
  });
  return collection;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color Generator
// ─────────────────────────────────────────────────────────────────────────────

var colorGenerator = (() => {
  let counter = 0;
  let totalColors = 20;

  function hslToRgba(h, s, l, alpha = 0.7) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) =>
      Math.round(
        255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))),
      );
    return `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${alpha})`;
  }

  function getColor() {
    totalColors = standCount;
    const hue = (counter % totalColors) * (360 / totalColors);
    return hslToRgba(hue, 90, 60);
  }

  function getColorByIndex(index) {
    totalColors = standCount;
    const hue = (index % totalColors) * (360 / totalColors);
    return hslToRgba(hue, 90, 60);
  }

  function nextColor() { counter++; }
  function getCounter() { return counter; }
  function reset() { counter = 0; }

  return { getColor, getColorByIndex, nextColor, getCounter, reset };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Stand List
// ─────────────────────────────────────────────────────────────────────────────

function populateStandList(foreignMapData, standDetails) {
  const container = document.getElementById("allStandsList");
  const badge = document.getElementById("standCountBadge");

  const allStands = [
    ...(standDetails?.completed ?? []),
    ...(standDetails?.pending ?? []),
  ];
  const pendingIds = new Set((standDetails?.pending ?? []).map(s => String(s.id)));

  badge.textContent = allStands.length;

  if (allStands.length === 0) {
    container.innerHTML =
      '<p style="color:#a0aec0;font-size:0.85em;margin:0;">Keine Stände gefunden.</p>';
    return;
  }

  const positionByUid = {};
  foreignMapData.forEach(([uid, , cells, color]) => {
    positionByUid[uid] = { color, placed: cells !== "none" };
  });

  container.innerHTML = "";

  allStands.forEach((stand) => {
    const pos = positionByUid[stand.id] ?? { color: "#cccccc", placed: false };
    const isPending = pendingIds.has(String(stand.id));
    const card = document.createElement("div");

    let badgeClass, badgeText;
    if (isPending) {
      badgeClass = "pending";
      badgeText = "ausstehend";
    } else if (pos.placed) {
      badgeClass = "placed";
      badgeText = "platziert";
    } else {
      badgeClass = "";
      badgeText = "offen";
    }

    card.className = "stand-card" + (isPending ? " pending" : (pos.placed ? "" : " no-position"));
    card.dataset.uid = stand.id;

    card.innerHTML = `
      <div class="stand-color-dot" style="background:${pos.color}"></div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:4px;">
          <div class="stand-card-title">${stand.titel ?? "Unbekannt"}</div>
          <div class="stand-card-badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="stand-card-meta">${stand.lehrer ?? "–"} · ${stand.klasse ?? "–"}</div>
        ${isPending ? `
        <div class="stand-card-actions">
          <button class="stand-action-btn accept" onclick="event.stopPropagation(); overviewDirectApprove('${stand.id}')">✓ Akzeptieren</button>
          <button class="stand-action-btn more" onclick="event.stopPropagation(); openApprovalModal('${stand.id}')">Mehr</button>
        </div>` : ""}
      </div>
    `;

    card.addEventListener("click", () => {
      setActiveStandCard(stand.id);
      selectStandOnMap(stand.id);
    });

    container.appendChild(card);
  });
}

function setActiveStandCard(uid) {
  document.querySelectorAll(".stand-card").forEach((el) => {
    el.classList.toggle("active", el.dataset.uid == uid);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Modal
// ─────────────────────────────────────────────────────────────────────────────

var _approvalModalStandId = null;

function openApprovalModal(standId) {
  var stand = findStandById(standId);
  if (!stand) return;

  document.getElementById("modal-stand-title").textContent = stand.titel ?? "";
  document.getElementById("modal-lehrer").textContent = stand.lehrer ?? "";
  document.getElementById("modal-klasse").textContent = stand.klasse ?? "";
  document.getElementById("modal-titel").textContent = stand.titel ?? "";
  document.getElementById("modal-beschreibung").textContent = stand.beschreibung ?? "Keine Beschreibung";

  var optionsEl = document.getElementById("modal-options");
  optionsEl.innerHTML = "";
  var qids = Array.isArray(stand.question_ids) ? stand.question_ids : [];
  qids.forEach(function (qid) {
    var li = document.createElement("li");
    li.textContent = questionIdLookup[qid] ?? String(qid);
    optionsEl.appendChild(li);
  });

  document.getElementById("modal-comment").value = "";
  _approvalModalStandId = standId;
  document.getElementById("approval-modal-backdrop").classList.add("open");
}

function closeApprovalModal() {
  document.getElementById("approval-modal-backdrop").classList.remove("open");
  _approvalModalStandId = null;
}

function modalAcceptStand() {
  var comment = document.getElementById("modal-comment").value;
  overviewSendFetch(_approvalModalStandId, "accepted", comment);
}

function modalRejectStand() {
  var comment = document.getElementById("modal-comment").value;
  if (!comment || comment.length < 10) {
    alert("Bitte mindestens 10 Zeichen als Kommentar eingeben");
    return;
  }
  if (comment.length > 1000) {
    alert("Der Kommentar ist zu lang");
    return;
  }
  overviewSendFetch(_approvalModalStandId, "declined", comment);
}

function overviewDirectApprove(standId) {
  if (!confirm("Stand bestätigen?")) return;
  overviewSendFetch(standId, "accepted", "");
}

function overviewSendFetch(standId, status, comment) {
  fetch("/admin/stand/" + standId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status, comment: comment }),
  })
    .then(function (r) { return r.json(); })
    .then(function (resData) {
      if (resData.ok === "ok") {
        closeApprovalModal();
        yearMapData = null;
        yearStandDetails = null;
        yearFetchInProgress = false;
        colorGenerator.reset();
        drawGrid();
      } else {
        alert("Fehler: " + (resData.error || "Unbekannter Fehler"));
      }
    })
    .catch(function (err) { alert("Netzwerkfehler: " + err); });
}