"""Builds index.html for GitHub Pages from src/game.html (the game, artifact style) + the Firebase shim.
Run: python build.py"""
from pathlib import Path
HERE = Path(__file__).parent
FB = "https://www.gstatic.com/firebasejs/10.12.2/"
HEAD = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Story Warz</title>
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
<script src="{FB}firebase-app-compat.js"></script>
<script src="{FB}firebase-auth-compat.js"></script>
<script src="{FB}firebase-firestore-compat.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script src="firebase-config.js"></script>
<script src="firebase-shim.js"></script>
</head><body>
'''
page = (HERE / "src/game.html").read_text(encoding="utf-8")
(HERE / "index.html").write_text(HEAD + page + "\n</body></html>\n", encoding="utf-8")
(HERE / "firebase-shim.js").write_text((HERE / "src/firebase-shim.js").read_text(encoding="utf-8"), encoding="utf-8")
print("built index.html")
