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
    submitEmailText1Btn = document.getElementById("submitEmailText1Btn");
    submitEmailText2Btn = document.getElementById("submitEmailText2Btn");
    submitEmailText3Btn = document.getElementById("submitEmailText3Btn");
    submitEmailText4Btn = document.getElementById("submitEmailText4Btn");
    submitEmailText5Btn = document.getElementById("submitEmailText5Btn");
    submitEmailText10Btn = document.getElementById("submitEmailText10Btn");
    sendEmailText10Btn = document.getElementById("sendEmailText10Btn");

    pageStatusToggle = document.getElementById("pageStatusToggle");
    pageStatusText = document.getElementById("pageStatusText");

    emailText1 = document.getElementById("emailText1");
    emailText2 = document.getElementById("emailText2");
    emailText3 = document.getElementById("emailText3");
    emailText4 = document.getElementById("emailText4");
    emailText5 = document.getElementById("emailText5");
    emailText10 = document.getElementById("emailText10");
    
    emailText1.value = emailTexts["1"];
    emailText2.value = emailTexts["2"];
    emailText3.value = emailTexts["3"];
    emailText4.value = emailTexts["4"];
    emailText5.value = emailTexts["5"];
    emailText10.value = emailTexts["10"];

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
    submitEmailText4Btn.addEventListener("click", function() {
        sendFetch("emailText4", document.getElementById("emailText4").value);
    }
    );
    submitEmailText5Btn.addEventListener("click", function() {
        sendFetch("emailText5", document.getElementById("emailText5").value);
    }
    );
    submitEmailText10Btn.addEventListener("click", function() {
        sendFetch("emailText10S", document.getElementById("emailText10").value);
    }
    );
    sendEmailText10Btn.addEventListener("click", function() {
        sendFetch("emailText10", document.getElementById("emailText10").value);
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
            if (action.includes("emailText")) {
                alert("Email text updated successfully");
                return
            }
            if (action.includes("pageStatus")) {
                return
            }
            document.location = "/admin"
        } else {
            alert("Error updating status: " + resData.error);
        }
    })
    .catch((error) => {
        console.error("Error:", error);
    });
}