bigDiv = document.getElementById("inner-grid");

statusText = `Folgende Einstellungen sind verfügbar`;
headingText = "Einstellungen";

placeholderTable = `
<tr>
    <td><button id="delElementNr|NR|Btn"></button></td>
    <td><p>|QUESTION|</p></td>
</tr>
`

var {} = ""
// questionIdLookup = questionIdLookup

function init() {
    bigDiv.innerHTML = '<div class="spacer" id="heading">ERROR</div>';
    document.getElementById("status-text").innerHTML = statusText;
  document.getElementById("heading").innerHTML = "<h2>"+headingText+"</h2>";
  fetch("/admin/loader/settings.html")
    .then((response) => response.text())
    .then((data) => {
      bigDiv.innerHTML += data;
      setup();
    })
    .catch((err) => console.error(err));
}
var quillEditors = {};

function setup() {
    submitNewQuestionBtn = document.getElementById("submitNewQuestionBtn");
    submitNewPwdBtn = document.getElementById("submitNewPwdBtn");
    questionsTable = document.getElementById("questionsTable");
    // Nur die Vorlagen, die auch tatsächlich versendet werden. Text 4
    // (an Orga) und Text 5 (Stand verschoben) sind im Backend nicht
    // angebunden und deshalb aus der Oberfläche entfernt.
    const EMAIL_TEMPLATE_IDS = ['emailText1', 'emailText2', 'emailText3', 'emailText10'];

    submitEmailText1Btn = document.getElementById("submitEmailText1Btn");
    submitEmailText2Btn = document.getElementById("submitEmailText2Btn");
    submitEmailText3Btn = document.getElementById("submitEmailText3Btn");
    submitEmailText10Btn = document.getElementById("submitEmailText10Btn");
    sendEmailText10Btn = document.getElementById("sendEmailText10Btn");

    pageStatusToggle = document.getElementById("pageStatusToggle");
    pageStatusText = document.getElementById("pageStatusText");

    // Ensure Quill.js is loaded before initializing
if (typeof Quill === 'undefined') {
    console.error('Quill.js is not loaded. Ensure the library is included before this script.');
} else {
    // Initialize Quill.js editors with color options in the toolbar
    
    EMAIL_TEMPLATE_IDS.forEach(id => {
        quillEditors[id] = new Quill(`#${id}`, {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ color: [] }, { background: [] }], // Add color and background options
                    ['link', 'image'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['clean']
                ]
            }
        });
    });

    // Populate Quill.js editors with database values
    EMAIL_TEMPLATE_IDS.forEach(id => {
        if (quillEditors[id]) {
            quillEditors[id].root.innerHTML = emailTexts[id.replace('emailText', '')] || '';
        }
    });
}

    submitEmailText1Btn.addEventListener("click", function() {
        sendFetch("emailText1", document.getElementById("emailText1").value);
    });
    submitEmailText2Btn.addEventListener("click", function() {
        sendFetch("emailText2", document.getElementById("emailText2").value);
    }
    );
    submitEmailText3Btn.addEventListener("click", function() {
        sendFetch("emailText3", document.getElementById("emailText3").value);
    }
    );
    submitEmailText10Btn.addEventListener("click", function() {
        sendFetch("emailText10S", "");
    }
    );
    sendEmailText10Btn.addEventListener("click", function() {
        sendFetch("emailText10", "");
    }
    );
    pageStatusToggle.addEventListener("click", function() {
        if (pageStatusToggle.checked) {
            pageStatusText.innerHTML = "aktiv";
            sendFetch("pageStatus", "1");
        } else {
            pageStatusText.innerHTML = "inaktiv";
            sendFetch("pageStatus", "0");
        }
    });
    if (enabled == 1) {
        pageStatusToggle.checked = true;
    } else {
        pageStatusToggle.checked = false;
    }
    if (pageStatusToggle.checked) {
        pageStatusText.innerHTML = " aktiv";
    } else {
        pageStatusText.innerHTML = "inaktiv";
    }

    allowReeditToggle = document.getElementById("allowReeditToggle");
    allowReeditText = document.getElementById("allowReeditText");

    allowReeditToggle.addEventListener("click", function() {
        if (allowReeditToggle.checked) {
            allowReeditText.innerHTML = "aktiv";
            sendFetch("allowReedit", "1");
        } else {
            allowReeditText.innerHTML = "inaktiv";
            sendFetch("allowReedit", "0");
        }
    });
    if (allowReeditSetting == "1") {
        allowReeditToggle.checked = true;
        allowReeditText.innerHTML = "aktiv";
    } else {
        allowReeditToggle.checked = false;
        allowReeditText.innerHTML = "inaktiv";
    }

    
    submitNewQuestionBtn.addEventListener("click", submitNewQuestion);
    submitNewPwdBtn.addEventListener("click", submitNewPassword);
    questionsTable.innerHTML = "";
    for(const [questionId, question] of Object.entries(questionIdLookup)) {
        const newRow = document.createElement("tr");
        newRow.innerHTML = placeholderTable.replace("|NR|", questionId).replace("|QUESTION|", question);
        questionsTable.appendChild(newRow);
        const deleteBtn = document.getElementById("delElementNr"+questionId+"Btn");
        deleteBtn.addEventListener("click", function() {
            deleteQuestion(`${questionId}`);
            });
    }
}


function submitNewQuestion() {
    const newQuestion = document.getElementById("newQuestion").value;
    sendFetch("newQuestion", newQuestion);
}

function submitNewPassword() {
    const newPassword = document.getElementById("newPwd").value;
    sendFetch("newPassword", newPassword);
}

function deleteQuestion(questionId) {
    console.log("Deleting question with ID: " + questionId);
    if (!confirm("Sind Sie sicher, dass Sie diese Frage löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.")) {
        return;
    }
    if (questionId == "4") {
        alert("Die Frage nach dem Strombedarf kann nicht gelöscht werden.");
        return;
    }
    sendFetch("deleteQuestion", questionId);
}



function sendFetch(action, value) {
    // "emailText10S" (Speichern & Senden) benutzt denselben Editor wie
    // "emailText10". Ohne das abschliessende S wegzuschneiden lief der
    // Lookup ins Leere, es wurde value: undefined gesendet und der Server
    // hat mit "Failed to update email text 10" geantwortet.
    var editorId = action.replace(/S$/, "");
    var editor = quillEditors[editorId];
    var quillContent = editor ? editor.root.innerHTML : value;
    fetch(`/admin/api`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "action": action,
            "value": quillContent,
            "origin": "settings"
        })
    })
    .then(response => response.json())
    .then(resData => {
        console.log("Success:", resData);
        if (resData.ok === "ok") {
            if (action.includes("emailText")) {
                alert("Email text updated successfully");
                return;
            }
            if (action.includes("pageStatus") || action.includes("allowReedit")) {
                return;
            }
            document.location = "/admin";
        } else {
            alert("Error updating status: " + resData.error);
        }
    })
    .catch((error) => {
        console.error("Error:", error);
    });
}