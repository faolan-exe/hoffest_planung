from datetime import timedelta
from flask import Flask, jsonify, redirect, render_template, request, session
from logger import get_logger
from flask_cors import CORS
import db
from werkzeug.middleware.proxy_fix import ProxyFix

db_manager = db.DatabaseManager()

logger = get_logger("main")
secretAuthKey = open("./secretAuthCode.txt", "r").readline()
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_host=1)
CORS(app)
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(weeks=99999)
app.config["SECRET_KEY"] = open("./flaskSecretKey.txt", "r").readline()


def checkAuth(id):
    if not validate_auth(id) and id != "bypass":
        return False
    if not db_manager.checkTrustedId(id) and id != "bypass":
        print("not trusted")
        return False
    return True


@app.route("/")
def index():
    id = request.args.get("id", "")
    if id != "":
        if checkAuth(id):
            session["id"] = id
            return redirect("/")
        return (
            jsonify(
                error="Invalid authentication",
                bypass="https://hoffest.t-auer.com/?id=bypass",
            ),
            401,
        )

    sessionValue = session.get("id", "")
    print("SESSION VALUE: " + sessionValue)
    if not checkAuth(sessionValue):
        session.clear()
        return (
            jsonify(
                error="Invalid authentication",
                bypass="https://hoffest.t-auer.com/?id=bypass",
            ),
            401,
        )

    already_submitted_data = db_manager.get_submitted_data_from_id(session.get("id"))
    return render_template("index.html", already_submitted_data=already_submitted_data)


@app.route("/commitStand", methods=["POST"])
def commitStand():
    if not checkAuth(session.get("id")):
        return jsonify(error="Invalid authentication"), 401
    data = request.json
    print(data)
    if db_manager.addNewStand(data, auth_id=session.get("id")):
        return jsonify({"ok": "ok"}), 200
    return jsonify({"error": "error"}), 401


@app.route("/register", methods=["POST"])
def register():
    data = request.json
    id = data["id"]
    secret = data["secret"] == secretAuthKey
    if secret and validate_auth(id):
        if db_manager.addNewTrustedId(id):
            print("success")
            return jsonify(ok=True), 200
        return jsonify(error="Failed to add ID"), 400


@app.route("/admin", methods=["POST", "GET"])
def admin_route():
    if request.method == "POST":
        data = request.json
        return login_route(data)
    if isinstance(session.get("adminName"), str):
        pending_ids = db_manager.get_pending()
        pending = []
        for id in pending_ids:
            pending.append(
                {"id": id, "value": db_manager.get_submitted_data_from_stand_id(id)}
            )
        completed_ids = db_manager.get_completed()
        completed = []
        for id in completed:
            pending.append(
                {"id": id, "value": db_manager.get_submitted_data_from_stand_id(id)}
            )
        return render_template(
            "admin.html",
            pending=pending,
            pendingCount=len(pending_ids),
            completed=completed,
            completedCount=len(completed_ids),
        )
    else:
        return login_route()


@app.route("/admin/<path_id>", methods=["GET", "POST"])
def admin_stand_route(path_id):
    if not isinstance(session.get("adminName"), str):
        return jsonify(error="Invalid authentication"), 401
    stand_data = db_manager.get_submitted_data_from_stand_id(path_id)
    return str(stand_data)


def login_route(data=None):
    if data:
        username = data["username"]
        password = data["password"]
        if db_manager.authenticateAdmin(username, password):
            session["adminName"] = username
            return "ok", 200
        else:
            return "failed", 401
    return render_template("/login.html")


@app.route("/robots.txt")
def static_robots():
    return "<pre>" + open("robots.txt").read().replace("\n", "<br>") + "</pre>"


def validate_auth(auth):
    try:
        id, checksum = auth.split(":")
    except Exception:
        return False
    logger.info("validating auth")
    logger.info(
        f"checksum: {type(checksum)}\nhashed: {type(reverse_obfuscated_algorithm(id))}"
    )
    return str(checksum) == str(reverse_obfuscated_algorithm(id))


def reverse_obfuscated_algorithm(input_string):
    input_string = str(input_string)
    hash_value = 0

    if len(input_string) == 0:
        return hash_value

    for char in input_string:
        char_code = ord(char)
        hash_value = ((hash_value << 5) - hash_value) + char_code
        hash_value = hash_value & 0xFFFFFFFF

    if hash_value >= 0x80000000:
        hash_value -= 0x100000000

    logger.info(hash_value)
    return hash_value


if __name__ == "__main__":
    app.run(port=8000, host="0.0.0.0", threaded=True, debug=True)
