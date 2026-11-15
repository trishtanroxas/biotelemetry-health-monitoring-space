import sys
import os

# Add root directory to python path for package imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app, handler

# Vercel entrypoint
app = app
handler = handler

