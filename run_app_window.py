import os
import shutil
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


def hidden_startup():
    if os.name != "nt":
        return None, 0
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0
    return startupinfo, subprocess.CREATE_NO_WINDOW


def start_hidden(args, cwd):
    startupinfo, creationflags = hidden_startup()
    return subprocess.Popen(
        args,
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        creationflags=creationflags,
        startupinfo=startupinfo,
    )


def find_browser():
    candidates = [
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("msedge"),
        shutil.which("chrome"),
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def start_app_window(project_dir):
    browser = find_browser()
    if not browser:
        webbrowser.open(APP_URL)
        return None

    user_data_dir = os.path.join(project_dir, ".app-profile")
    os.makedirs(user_data_dir, exist_ok=True)
    args = [
        browser,
        f"--app={APP_URL}",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--disable-default-apps",
    ]
    return start_hidden(args, project_dir)


def wait_until_ready():
    deadline = time.time() + 30
    while time.time() < deadline:
        if is_port_in_use(FRONTEND_PORT) and is_port_in_use(BACKEND_PORT):
            return True
        time.sleep(0.5)
    return False


def stop_process(proc):
    if not proc or proc.poll() is not None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main():
    project_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = get_python_exe()
    owned_processes = []

    try:
        if not is_port_in_use(ENRICHER_PORT):
            owned_processes.append(start_hidden([python_exe, "src/services/enricher/main.py", "--api"], project_dir))

        if not is_port_in_use(BACKEND_PORT):
            owned_processes.append(start_hidden([python_exe, "-m", "src.api"], project_dir))

        if not is_port_in_use(FRONTEND_PORT):
            npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
            owned_processes.append(start_hidden([npm_cmd, "run", "dev", "--", "--host", "127.0.0.1"], os.path.join(project_dir, "web")))

        wait_until_ready()
        app_proc = start_app_window(project_dir)
        if app_proc:
            app_proc.wait()
        else:
            # Fallback browser mode cannot be monitored reliably.
            return
    finally:
        for proc in reversed(owned_processes):
            stop_process(proc)


if __name__ == "__main__":
    main()
