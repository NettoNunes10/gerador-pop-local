import subprocess
import os
import sys
import time
import webbrowser
import socket

# Configuração do executável Python (Usando 3.10 para compatibilidade com TensorFlow)
PYTHON_EXE = r"C:\Users\netto\AppData\Local\Programs\Python\Python310\python.exe"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def run_app():
    print("🚀 Iniciando ecossistema Gerador POP FM...")
    
    # Verificação de Portas
    if is_port_in_use(8003):
        print("⚠️  ERRO: A porta 8003 (Backend) já está ocupada.")
        return
    if is_port_in_use(8001):
        print("⚠️  ERRO: A porta 8001 (Enricher) já está ocupada.")
        return

    # 1. Iniciar o Enricher (Essentia API)
    print("  [1/3] Iniciando serviço de inteligência (Enricher) na porta 8001...")
    enricher_proc = subprocess.Popen(
        [PYTHON_EXE, "src/services/enricher/main.py", "--api"],
        cwd=os.getcwd()
    )
    time.sleep(2) # Aguarda o motor de IA carregar os modelos

    # 2. Iniciar o Backend (FastAPI) em um processo separado

    print("  [2/3] Iniciando backend na porta 8003...")
    backend_proc = subprocess.Popen(
        [PYTHON_EXE, "-m", "src.api"],
        cwd=os.getcwd()
    )

    # 3. Iniciar o Frontend (Vite)
    print("  [3/3] Iniciando interface web...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
        cwd=os.path.join(os.getcwd(), "web"),
        shell=True
    )

    print("\n✅ Ambiente pronto!")
    print("🔗 Backend:   http://127.0.0.1:8003")
    print("🔗 Interface: http://127.0.0.1:5173")
    
    time.sleep(3)
    webbrowser.open("http://127.0.0.1:5173")

    try:
        while True:
            if enricher_proc.poll() is not None:
                print("\n❌ Enricher parou inesperadamente.")
                break
            if backend_proc.poll() is not None:
                print("\n❌ Backend parou inesperadamente.")
                break
            if frontend_proc.poll() is not None:
                print("\n❌ Frontend parou inesperadamente.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Encerrando servidores...")
        enricher_proc.terminate()
        backend_proc.terminate()
        frontend_proc.terminate()
        print("Até logo!")

if __name__ == "__main__":
    if not os.path.exists("web/node_modules"):
        print("📦 Dependências do frontend não encontradas. Executando npm install...")
        subprocess.run(["npm", "install"], cwd="web", shell=True)
    
    run_app()
