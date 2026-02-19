from flask import Flask, request, jsonify
import easyocr, io, PyPDF2, langdetect

app = Flask(__name__)
reader = easyocr.Reader(["en"])

@app.route("/analyze", methods=["POST"])
def analyze():
    user_id = request.headers.get("X-User-ID", "anon")
    data = request.data
    text = ""

    try:
        # Detect PDF
        if data[:4] == b"%PDF":
            reader_pdf = PyPDF2.PdfReader(io.BytesIO(data))
            text = "\n".join([page.extract_text() or "" for page in reader_pdf.pages])
        else:
            results = reader.readtext(data)
            text = " ".join([t[1] for t in results])
        lang = langdetect.detect(text[:200]) if text else "unknown"
        return jsonify({"text": text[:4000], "lang": lang, "user": user_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
