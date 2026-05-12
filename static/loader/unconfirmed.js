var bigDiv = document.getElementById("inner-grid");

function init() {
  bigDiv.innerHTML = '<div class="spacer" id="heading"><h2>Ausstehend:</h2></div>';
  document.getElementById("status-text").innerHTML = "";

  const yearBar = document.createElement("div");
  yearBar.style.cssText = "padding: 8px 12px 4px; display: flex; align-items: center; gap: 8px; grid-column: 1 / -1;";

  const label = document.createElement("label");
  label.textContent = "Jahr: ";
  label.style.fontWeight = "600";

  const sel = document.createElement("select");
  sel.id = "pending-year-select";
  sel.style.cssText = "padding: 4px 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px;";

  const currentYear = new Date().getFullYear();
  for (var y = currentYear; y >= 2025; y--) {
    var opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener("change", function () {
    loadForYear(parseInt(this.value));
  });

  yearBar.appendChild(label);
  yearBar.appendChild(sel);
  bigDiv.appendChild(yearBar);

  loadForYear(currentYear);
}

function loadForYear(year) {
  document.querySelectorAll(".pending-card").forEach(function (el) { el.remove(); });

  fetch("/admin/api/standDetails/" + year)
    .then(function (r) { return r.json(); })
    .then(function (details) {
      var stands = details.pending || [];
      var count = stands.length;

      if (count === 1) {
        document.getElementById("status-text").innerHTML = "<h3>Es steht noch 1 Stand aus.</h3>";
      } else if (count === 0) {
        document.getElementById("status-text").innerHTML = "<h3>Es stehen keine Stände zum Bestätigen aus.</h3>";
      } else {
        document.getElementById("status-text").innerHTML = "<h3>Es stehen noch " + count + " Stände aus.</h3>";
      }

      if (count === 0) {
        var empty = document.createElement("div");
        empty.className = "grid2-item inner-left pending-card";
        empty.innerHTML = '<p style="color:#718096;padding:12px;">Keine ausstehenden Stände für dieses Jahr.</p>';
        bigDiv.appendChild(empty);
        return;
      }

      var position = -1;
      stands.forEach(function (stand) {
        var lehrer = stand.lehrer, klasse = stand.klasse, titel = stand.titel,
            beschreibung = stand.beschreibung, id = stand.id;
        position = (position + 1) % 3;
        var posClass = position === 0 ? "inner-left" : position === 1 ? "inner-mid" : "inner-right";

        var div = document.createElement("div");
        div.className = "grid2-item pending-card " + posClass;
        div.innerHTML = '\
          <div class="info-card" style="position:relative">\
            <span class="title2">' + lehrer + ', ' + klasse + '</span><br/>\
            <span class="title">' + titel + '</span>\
            <p class="description">' + beschreibung + '</p>\
            <div class="actions">\
              <a href="#" onclick="load(\'nav5\', \'' + id + '\')">Details ➡</a>\
            </div>\
          </div>';
        bigDiv.appendChild(div);
      });
    })
    .catch(function (err) { console.error("Error loading pending stands:", err); });
}
