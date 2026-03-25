import os
import pg8000
import pg8000.native
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Load .env when running locally (ignored on Vercel)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────────────────────────────────────────────────────────
#  Flask app — static + template folders relative to this file
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static",
    template_folder=os.path.join(BASE_DIR, "templates"),
)
CORS(app)

# ═════════════════════════════════════════════════════════════════════════════
#  DATABASE CONFIGURATION
#  ─────────────────────────────────────────────────────────────────────────
#  Set DATABASE_URL in:
#    • Local dev  →  create a .env file in this folder
#    • Vercel     →  Dashboard → Project → Settings → Environment Variables
#
#  Format:
#    postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres
# ═════════════════════════════════════════════════════════════════════════════

DATABASE_URL   = os.environ.get("DATABASE_URL", "")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# ─────────────────────────────────────────────────────────────────────────────
#  Database helpers  (pg8000 — pure Python, works on Vercel)
# ─────────────────────────────────────────────────────────────────────────────

def parse_db_url(url):
    """Parse a postgresql:// URI into pg8000.connect() kwargs."""
    # Remove scheme
    url = url.replace("postgresql://", "").replace("postgres://", "")
    # userinfo@host/dbname
    userinfo, rest = url.split("@", 1)
    user, password  = userinfo.split(":", 1)
    hostpart, dbname = rest.split("/", 1)
    if ":" in hostpart:
        host, port = hostpart.split(":", 1)
        port = int(port)
    else:
        host = hostpart
        port = 5432
    # strip query params from dbname if present
    dbname = dbname.split("?")[0]
    return dict(host=host, port=port, user=user, password=password, database=dbname, ssl_context=True)


def get_db():
    """Return a new pg8000 connection."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. "
            "Add it to Vercel → Settings → Environment Variables."
        )
    kwargs = parse_db_url(DATABASE_URL)
    return pg8000.connect(**kwargs)


def fetchall_as_dicts(cursor):
    """Convert pg8000 rows (tuples) + cursor.description → list of dicts."""
    if cursor.description is None:
        return []
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def fetchone_as_dict(cursor):
    """Convert a single pg8000 row to a dict."""
    if cursor.description is None:
        return None
    cols = [d[0] for d in cursor.description]
    row  = cursor.fetchone()
    return dict(zip(cols, row)) if row else None


def init_db():
    """Create the complaints table if it doesn't exist."""
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id          SERIAL       PRIMARY KEY,
            name        VARCHAR(120),
            email       VARCHAR(254),
            department  VARCHAR(100) NOT NULL,
            title       VARCHAR(200) NOT NULL,
            description TEXT         NOT NULL,
            status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
            created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("[DB] Table ready.")


try:
    init_db()
except Exception as exc:
    print(f"[DB] init skipped: {exc}")

# ─────────────────────────────────────────────────────────────────────────────
#  Auth
# ─────────────────────────────────────────────────────────────────────────────

def check_admin(data):
    return (
        data.get("username") == ADMIN_USERNAME
        and data.get("password") == ADMIN_PASSWORD
    )

# ─────────────────────────────────────────────────────────────────────────────
#  Page routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(os.path.join(BASE_DIR, "templates"), "index.html")


@app.route("/admin")
def admin_page():
    return send_from_directory(os.path.join(BASE_DIR, "templates"), "admin.html")

# ─────────────────────────────────────────────────────────────────────────────
#  API: submit complaint  (public)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/submit_complaint", methods=["POST"])
def submit_complaint():
    data = request.get_json(silent=True) or {}

    is_anonymous = data.get("anonymous", False)
    department   = (data.get("department")  or "").strip()
    title        = (data.get("title")       or "").strip()
    description  = (data.get("description") or "").strip()
    name         = None if is_anonymous else (data.get("name")  or "").strip() or None
    email        = None if is_anonymous else (data.get("email") or "").strip() or None

    if not department:
        return jsonify({"error": "Department is required."}), 400
    if not title:
        return jsonify({"error": "Complaint title is required."}), 400
    if not description:
        return jsonify({"error": "Description is required."}), 400
    if len(title) > 200:
        return jsonify({"error": "Title must be 200 characters or fewer."}), 400
    if len(description) > 5000:
        return jsonify({"error": "Description must be 5,000 characters or fewer."}), 400

    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        """
        INSERT INTO complaints (name, email, department, title, description, status, created_at)
        VALUES (%s, %s, %s, %s, %s, 'pending', NOW())
        RETURNING id, created_at
        """,
        (name, email, department, title, description),
    )
    row = fetchone_as_dict(cur)
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message":    "Complaint submitted successfully.",
        "id":         row["id"],
        "created_at": str(row["created_at"]),
    }), 201

# ─────────────────────────────────────────────────────────────────────────────
#  API: list complaints  (admin)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/complaints", methods=["POST"])
def get_complaints():
    data = request.get_json(silent=True) or {}
    if not check_admin(data):
        return jsonify({"error": "Unauthorized."}), 401

    department = (data.get("department") or "").strip()
    status     = (data.get("status")     or "").strip()

    query  = "SELECT * FROM complaints WHERE 1=1"
    params = []

    if department:
        query += " AND department = %s"
        params.append(department)
    if status:
        query += " AND status = %s"
        params.append(status)

    query += " ORDER BY created_at DESC"

    conn = get_db()
    cur  = conn.cursor()
    cur.execute(query, params)
    rows = fetchall_as_dicts(cur)
    cur.close()
    conn.close()

    for r in rows:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])

    return jsonify({"complaints": rows}), 200

# ─────────────────────────────────────────────────────────────────────────────
#  API: resolve / re-open  (admin)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/resolve/<int:complaint_id>", methods=["PUT"])
def resolve_complaint(complaint_id):
    data = request.get_json(silent=True) or {}
    if not check_admin(data):
        return jsonify({"error": "Unauthorized."}), 401

    new_status = data.get("status", "resolved")
    if new_status not in ("pending", "resolved"):
        return jsonify({"error": "status must be 'pending' or 'resolved'."}), 400

    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "UPDATE complaints SET status = %s WHERE id = %s RETURNING id",
        (new_status, complaint_id),
    )
    row = fetchone_as_dict(cur)
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"error": "Complaint not found."}), 404

    return jsonify({"message": f"Complaint #{complaint_id} marked as {new_status}."}), 200

# ─────────────────────────────────────────────────────────────────────────────
#  API: delete  (admin)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/delete/<int:complaint_id>", methods=["DELETE"])
def delete_complaint(complaint_id):
    data = request.get_json(silent=True) or {}
    if not check_admin(data):
        return jsonify({"error": "Unauthorized."}), 401

    conn = get_db()
    cur  = conn.cursor()
    cur.execute("DELETE FROM complaints WHERE id = %s RETURNING id", (complaint_id,))
    row = fetchone_as_dict(cur)
    conn.commit()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"error": "Complaint not found."}), 404

    return jsonify({"message": f"Complaint #{complaint_id} deleted."}), 200

# ─────────────────────────────────────────────────────────────────────────────
#  API: admin login check
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    if check_admin(data):
        return jsonify({"message": "Login successful."}), 200
    return jsonify({"error": "Invalid credentials."}), 401

# ─────────────────────────────────────────────────────────────────────────────
#  Local dev
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000)
