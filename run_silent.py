import os
import socket
import subprocess
import sys
import time
import webbrowser


APP_URL = "http://127.0.0.1:5173"
BACKEND_PORT = 8003
ENRICHER_PORT = 8001
FRONTEND_PORT = 5173
PYTHON_310 = r"C:\Users\netto\AppData\Local\Programs\Python\Python310\python.exe"


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def get_python_exe():
    if os.path.exists(PYTHON_310):
        return PYTHON_310
    return sys.executable.replace("pythonw.exe", "python.exe")


def start_hidden(args, cwd):
    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0

    return subprocess.Popen(
        args,
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        creationflags=creationflags,
        startupinfo=startupinfo,
        close_fds=True,
    )


def main():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = get_python_exe()

    if not is_port_in_use(ENRICHER_PORT):
        start_hidden([python_exe, "src/services/enricher/main.py", "--api"], project_dir)

    if not is_port_in_use(BACKEND_PORT):
        start_hidden([python_exe, "-m", "src.api"], project_dir)

    if not is_port_in_use(FRONTEND_PORT):
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        start_hidden([npm_cmd, "run", "dev", "--", "--host", "127.0.0.1"], os.path.join(project_dir, "web"))

    deadline = time.time() + 20
    while time.time() < deadline:
        if is_port_in_use(FRONTEND_PORT) and is_port_in_use(BACKEND_PORT):
            break
        time.sleep(0.5)

    webbrowser.open(APP_URL)


if __name__ == "__main__":
    main()
