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


function setup() {
    submitNewQuestionBtn = document.getElementById("submitNewQuestionBtn");
    submitNewPwdBtn = document.getElementById("submitNewPwdBtn");
    questionsTable = document.getElementById("questionsTable");
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
    sendFetch("deleteQuestion", questionId);
}



function sendFetch(action, value) {
    fetch(`/admin/api`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "action": action,
            "value": value,
            "origin": "settings"
        })
    })
    .then(response => response.json())
    .then(resData => {
        console.log("Success:", resData);
        if (resData.ok === "ok") {
            document.location = "/admin"
        } else {
            alert("Error updating status: " + resData.error);
        }
    })
    .catch((error) => {
        console.error("Error:", error);
    });

    
}