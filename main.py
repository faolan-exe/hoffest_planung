from datetime import timedelta
from flask import Flask, jsonify, redirect, render_template, request, session
from logger import get_logger
from flask_cors import CORS
import db

db_manager = db.DatabaseManager()

logger = get_logger("main")
secretAuthKey = open("./secretAuthCode.txt", "r").readline()
app = Flask(__name__)
CORS(app)
app.config['PERMANENT_SESSION_LIFETIME'] =  timedelta(weeks=99999)
app.config['SECRET_KEY'] = open("./flaskSecretKey.txt", "r").readline()


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
        return jsonify(error="Invalid authentication", bypass="https://hoffest.t-auer.com/?id=bypass"), 401
    
    sessionValue = session.get("id", "")
    if checkAuth(sessionValue):
        return render_template('index.html')
    session.clear()
    return jsonify(error="Invalid authentication", bypass="https://hoffest.t-auer.com/?id=bypass"), 401
    

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





def validate_auth(auth):
    try:
        id, checksum = auth.split(":")
    except ValueError:
        return False
    logger.info("validating auth")
    logger.info(f"checksum: {type(checksum)}\nhashed: {type(reverse_obfuscated_algorithm(id))}")
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





if __name__ == '__main__':
    app.run(port=8000, host="0.0.0.0", threaded=True,debug=True)