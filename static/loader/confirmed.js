if (data.completed.length == 1) {
  statusText = "<h3>Es ist bereits 1 Stand bestätigt.</h3>";
} else if (data.completed.length == 0) {
  statusText = "<h3>Es wurden noch keine Stände bestätigt.</h3>";
} else {
  statusText = "<h3>Es wurden " + data.completed.length + " Stände bestätigt.</h3>";
}
headingText = "<h2>Bestätigt:</h2>";

position = -1;
standData = data.completed


bigDiv = document.getElementById("inner-grid");
function init() {
  bigDiv.innerHTML = "<div class=\"spacer\" id=\"heading\">ERROR</div>";
  document.getElementById("status-text").innerHTML = statusText;
  document.getElementById("heading").innerHTML = headingText;

  standData.forEach((stand) => {
    const { lehrer, klasse, titel, beschreibung, ort, id } = stand;
    position = position + 1;
    console.log(position);
    if (position == 3) {
      position = 0;
    }

    const template = `
        <div class="grid2-item ${position == 0
        ? "inner-left"
        : position == 1
          ? "inner-mid"
          : "inner-right"
      }">
              <div class="info-card" style="position: relative">
                <span class="title2">${lehrer}, ${klasse}</span>
                <br />
                <span class="title">${titel}</span>
                <p class="description">
                  ${beschreibung}
                </p>
                <div class="actions">
                  <a href="/admin/stand/${id}">Details ➡</a>
                </div>
              </div>
            </div>
        `;

    bigDiv.innerHTML += template;
  });
}

