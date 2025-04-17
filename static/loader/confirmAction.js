bigDiv = document.getElementById("inner-grid");
myData = data.pending.find((item) => item.id == currentID);
var { klasse, lehrer, titel, beschreibung, ort_spezifikation, ort, question_ids, id } = myData;
statusText = `Genehmigung für den Stand von ${lehrer}`;
headingText = titel;

function init() {
  bigDiv.innerHTML = '<div class="spacer" id="heading">ERROR</div>';
  document.getElementById("status-text").innerHTML = statusText;
  document.getElementById("heading").innerHTML = headingText;
  fetch("/admin/loader/confirmAction.html")
    .then((response) => response.text())
    .then((data) => {
      bigDiv.innerHTML += data;
      setup();
    })
    .catch((err) => console.error(err));
}

function setup() {
  lehrkraftField = document.getElementById("lehrkraft");
  lehrkraftField.innerHTML = lehrer;
  projektnameField = document.getElementById("projektname");
    projektnameField.innerHTML = titel;
  beschreibungField = document.getElementById("beschreibung");
    beschreibungField.innerHTML = beschreibung;
  optionsField = document.getElementById("options");
  optionsField.innerHTML = "";
  for (let i = 0; i < question_ids.length; i++) {
    optionsField.innerHTML += `<li style="margin-left:2rem;">${questionIdLookup[question_ids[i]]}</li>`;
  }


  confirmButton = document.getElementById("confirm-button");
  rejectButton = document.getElementById("reject-button");
  cancelButton = document.getElementById("cancel-button");

  confirmButton.addEventListener("click", confirmStand);
  rejectButton.addEventListener("click", rejectStand);
}

function confirmStand() {
    sendFetch("accepted", document.getElementById("comment").value);
}

function rejectStand() {
    const comment = document.getElementById("comment").value;
    if (comment === "") {
        alert("Bitte einen Kommentar eingeben");
        return;
    }
    if (comment.length > 1000) {
        alert("Der Kommentar ist zu lang");
        return;
    }
    if (comment.length < 10) {
        alert("Der Kommentar ist zu kurz");
        return;
    }
    sendFetch("declined", comment);
}



function sendFetch(status, comment) {
    fetch(`/admin/stand/${id}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "status": status,
            "comment": comment
        })
    })
    .then(response => response.json())
    .then(resData => {
        console.log("Success:", resData);
        if (resData.ok === "ok") {
            alert("Status updated successfully!");
            document.location = "/admin"
        } else {
            alert("Error updating status: " + data.error);
        }
    })
    .catch((error) => {
        console.error("Error:", error);
    });
}