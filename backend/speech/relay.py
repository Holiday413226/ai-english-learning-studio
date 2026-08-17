"""Phone voice relay — lightweight HTTP text bridge.

A companion page served to the phone browser (GET /phone-relay) uses
the phone's Web Speech API for high-quality ASR, then POSTs recognized
text to /api/relay/send.  The desktop frontend polls /api/relay/receive.

No WebSocket, no extra dependencies — pure HTTP polling at 1 s intervals.
"""

import time
import socket
from flask import request, jsonify, render_template_string


# ── In-memory store (one entry — only the latest text matters) ─────────────

_latest_text = {"text": "", "lang": "zh-CN", "timestamp": 0}


# ── Phone HTML page ─────────────────────────────────────────────────────────

PHONE_PAGE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>Voice Relay</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;
       background:#1a1a2e;color:#e0e0e0;min-height:100vh;
       display:flex;flex-direction:column;align-items:center;padding:24px 16px}
  h2{font-size:1.1rem;margin-bottom:20px;color:#50fa7b}
  .lang-row{display:flex;gap:8px;margin-bottom:16px}
  .lang-btn{flex:1;padding:10px;border:2px solid #5a2d8a;border-radius:8px;
             background:transparent;color:#9b8ab8;font-size:0.95rem;cursor:pointer}
  .lang-btn.on{border-color:#50fa7b;color:#50fa7b;background:#0d2b0d}
  .mic-area{width:100%;max-width:360px;margin-bottom:16px}
  .mic-btn{width:100%;padding:18px;border:none;border-radius:12px;
            background:#5a2d8a;color:#e0e0e0;font-size:1.1rem;cursor:pointer}
  .mic-btn:active,.mic-btn.listening{background:#50fa7b;color:#1a1a2e}
  .mic-btn:disabled{opacity:0.5}
  .status{font-size:0.8rem;color:#9b8ab8;margin:8px 0;text-align:center;min-height:20px}
  textarea{width:100%;max-width:360px;height:100px;padding:12px;border:2px solid #5a2d8a;
            border-radius:8px;background:#16213e;color:#e0e0e0;font-size:1rem;
            resize:vertical;margin-bottom:12px}
  .send-btn{width:100%;max-width:360px;padding:14px;border:none;border-radius:12px;
             background:#50fa7b;color:#1a1a2e;font-size:1.05rem;font-weight:bold;cursor:pointer}
  .send-btn:disabled{opacity:0.4}
  .toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);
          background:#50fa7b;color:#1a1a2e;padding:10px 24px;border-radius:8px;
          font-weight:bold;display:none;z-index:10}
</style>
</head>
<body>

<h2>&#x1F4F1; Voice Relay</h2>

<div class="lang-row">
  <button class="lang-btn on" data-lang="zh-CN">&#x1F1E8;&#x1F1F3; 中文</button>
  <button class="lang-btn"    data-lang="en-US">&#x1F1FA;&#x1F1F8; English</button>
</div>

<div class="mic-area">
  <button class="mic-btn" id="micBtn">&#x1F3A4; Tap to Speak</button>
  <div class="status" id="status">Ready</div>
</div>

<textarea id="textBox" placeholder="Recognized text will appear here..."></textarea>
<button class="send-btn" id="sendBtn">&#x2709; Send to Computer</button>
<div class="toast" id="toast"></div>

<script>
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var lang = 'zh-CN';
  var recognition = null;
  var listening = false;

  // ── Language toggle ──────────────────────────────────────────
  document.querySelectorAll('.lang-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.lang-btn').forEach(function(b){b.classList.remove('on');});
      btn.classList.add('on');
      lang = btn.dataset.lang;
    });
  });

  // ── Start / stop recognition ─────────────────────────────────
  function initRecognition(){
    if(!SpeechRecognition){ return null; }
    var r = new SpeechRecognition();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = false;
    r.onresult = function(e){
      document.getElementById('textBox').value = e.results[0][0].transcript;
      document.getElementById('status').textContent = 'Recognized!';
      document.getElementById('micBtn').textContent = '🎤 Tap to Speak';
      document.getElementById('micBtn').classList.remove('listening');
      listening = false;
    };
    r.onerror = function(e){
      document.getElementById('status').textContent = 'Error: ' + e.error;
      document.getElementById('micBtn').textContent = '🎤 Tap to Speak';
      document.getElementById('micBtn').classList.remove('listening');
      listening = false;
    };
    r.onend = function(){
      document.getElementById('micBtn').classList.remove('listening');
      listening = false;
    };
    return r;
  }

  document.getElementById('micBtn').addEventListener('click', function(){
    if(!SpeechRecognition){
      document.getElementById('status').textContent = 'Speech API not supported in this browser. Use Chrome.';
      return;
    }
    if(listening){
      recognition && recognition.stop();
      return;
    }
    recognition = initRecognition();
    if(!recognition) return;
    recognition.lang = lang;
    recognition.start();
    listening = true;
    document.getElementById('micBtn').textContent = '🎙 Listening...';
    document.getElementById('micBtn').classList.add('listening');
    document.getElementById('status').textContent = 'Speak now...';
  });

  // ── Send to computer ─────────────────────────────────────────
  document.getElementById('sendBtn').addEventListener('click', function(){
    var text = document.getElementById('textBox').value.trim();
    if(!text) return;
    var btn = document.getElementById('sendBtn');
    btn.disabled = true; btn.textContent = 'Sending...';
    fetch('/api/relay/send', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text:text, lang:lang})
    }).then(function(r){ return r.json(); })
      .then(function(d){
        var t = document.getElementById('toast');
        t.style.display='block'; t.textContent = d.status==='ok' ? 'Sent!' : 'Failed!';
        setTimeout(function(){t.style.display='none';}, 1500);
        btn.disabled = false; btn.textContent = '✉ Send to Computer';
      }).catch(function(){
        btn.disabled = false; btn.textContent = '✉ Send to Computer';
      });
  });
</script>
</body>
</html>"""


def _get_local_ip() -> str:
    """Return the LAN IP address of this machine (best-effort)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def register_relay_routes(app):
    """Register phone-relay routes on the Flask app."""

    @app.route("/phone-relay")
    def phone_relay():
        """Serve the phone voice-input page."""
        return render_template_string(PHONE_PAGE)

    @app.route("/api/relay/send", methods=["POST"])
    def relay_send():
        """Receive text from the phone and store it."""
        global _latest_text
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"status": "error", "message": "JSON body required"}), 400
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"status": "error", "message": "text is empty"}), 400
        _latest_text = {
            "text": text,
            "lang": data.get("lang", "zh-CN"),
            "timestamp": time.time(),
        }
        return jsonify({"status": "ok"})

    @app.route("/api/relay/receive", methods=["GET"])
    def relay_receive():
        """Polled by the desktop frontend. Returns latest text if newer than :since."""
        try:
            since = float(request.args.get("since", "0"))
        except (ValueError, TypeError):
            since = 0.0
        if _latest_text["timestamp"] > since:
            return jsonify(_latest_text)
        return jsonify({"text": None, "lang": "zh-CN", "timestamp": _latest_text["timestamp"]})

    @app.route("/api/relay/info", methods=["GET"])
    def relay_info():
        """Return phone-relay URL info for QR code generation."""
        ip = _get_local_ip()
        port = app.config.get("SERVER_PORT", 5000)
        return jsonify({
            "url": f"http://{ip}:{port}/phone-relay",
            "ip": ip,
            "port": port,
        })
