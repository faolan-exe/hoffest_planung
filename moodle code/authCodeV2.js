async function sha256(message) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);
  // hash the message
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // convert bytes to hex string
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

progress = document.getElementById("progress");
secretCode = document.getElementById("secretAuthCode").value;
id = M.cfg.userId;

var hashedID;


function start() {
  fetch("https://hoffest.t-auer.com/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: id,
      hashedID: hashedID,
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      if (result.ok == true) {
        document.getElementById("linkBtn").onclick = function () {
          window.open("https://hoffest.t-auer.com?id=" + hashedID, "_blank");
        };
        loadTable();
      } else {
        console.error("Error:", result);
        progress.innerHTML =
          "Es ist etwas schiefgelaufen! Bitte laden Sie die Seite erneut oder schreiben sie an hoffestSupport@t-auer.com: <br>" +
          result;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      progress.innerHTML =
        "Es ist etwas sehr schiefgelaufen! Bitte laden Sie die Seite erneut oder schreiben sie an hoffestSupport@t-auer.com: <br>" +
        error;
    });
}

function loadTable() {
  fetch("https://hoffest.t-auer.com/moodleApi?id=" + hashedID)
    .then((response) => response.json())
    .then((data) => {
      // Bestätigte Projekte einfügen
      const confirmedTableBody = document
        .getElementById("confirmedTable")
        .querySelector("tbody");
      if (data.confirmed.length === 0) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="2">Keine bestätigten Stände</td>`;
        confirmedTableBody.appendChild(row);
      }
      data.confirmed.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                        <td style="padding: 8px 12px;text-align: left;border: 1px solid #ddd;">${item.lehrer}</td>
                        <td style="padding: 8px 12px;text-align: left;border: 1px solid #ddd;">${item.name}</td>
                    `;
        confirmedTableBody.appendChild(row);
      });
      const pendingTableBody = document
        .getElementById("pendingTable")
        .querySelector("tbody");
      // Ausstehende Projekte einfügen
      if (data.pending.length === 0) {
        const row = document.createElement("tr");
        row.innerHTML = `<td style="padding: 8px 12px;text-align: left;border: 1px solid #ddd;" colspan="2">Keine ausstehenden Stände</td>`;
        pendingTableBody.appendChild(row);
      }

      data.pending.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
                        <td style="padding: 8px 12px;text-align: left;border: 1px solid #ddd;">${item.lehrer}</td>
                        <td style="padding: 8px 12px;text-align: left;border: 1px solid #ddd;">${item.name}</td>
                    `;
        pendingTableBody.appendChild(row);
      });
    })
    .catch((error) => {
      console.error("Fehler beim Laden der Daten:", error);
      progress.innerHTML = "Fehler beim Laden der Daten: " + error;
    });
}

sha256(secretCode + id.toString()).then((hash) => {
  hashedID = hash;
  start();
});
