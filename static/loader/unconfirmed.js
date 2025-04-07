if (data.pending.length == 1) {
  statusText = "<h3>Es steht noch 1 Stand aus.</h3>";
} else if (data.pending.length == 0) {
  statusText = "<h3>Es stehen keine Stände zum Bestätigen aus.</h3>";
} else {
  statusText = "<h3>Es stehen noch " + data.pending.length + " Stände aus.</h3>";
}
headingText = "<h2>Ausstehend:</h2>";

position = -1;
standData = data.pending


bigDiv = document.getElementById("inner-grid");
function init() {
  bigDiv.innerHTML = "<div class=\"spacer\" id=\"heading\">ERROR</div>";
  document.getElementById("status-text").innerHTML = statusText;
  document.getElementById("heading").innerHTML = headingText;

  standData.forEach((stand) => {
    const { lehrer, klasse, titel, beschreibung, ort } = stand;
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
                  <a href="">Details ➡</a>
                </div>
              </div>
            </div>
        `;

    bigDiv.innerHTML += template;
  });
}

