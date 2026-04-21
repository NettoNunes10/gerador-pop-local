import subprocess
import os
import sys
import time
import webbrowser
import socket

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def run_app():
    print("🚀 Iniciando ecossistema Gerador POP FM...")
    
    # Verificação de Portas
    if is_port_in_use(8000):
        print("⚠️  ERRO: A porta 8000 (Backend) já está ocupada.")
        print("   Certifique-se de que não há outra instância do gerador rodando.")
        return

    # 1. Iniciar o Backend (FastAPI) em um processo separado
    print("  [1/2] Iniciando backend na porta 8000...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "src.api"],
        cwd=os.getcwd()
    )

    # 2. Iniciar o Frontend (Vite)
    print("  [2/2] Iniciando interface web...")
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
        cwd=os.path.join(os.getcwd(), "web"),
        shell=True
    )

    print("\n✅ Ambiente pronto!")
    print("🔗 Backend: http://127.0.0.1:8000")
    print("🔗 Interface: http://127.0.0.1:5173")
    
    time.sleep(3)
    webbrowser.open("http://127.0.0.1:5173")

    try:
        while True:
            # Se o backend cair, mostra o erro capturado
            if backend_proc.poll() is not None:
                print("\n❌ Backend parou inesperadamente. Erro:")
                if backend_proc.stdout:
                    print("-" * 50)
                    print(backend_proc.stdout.read())
                    print("-" * 50)
                break
                
            if frontend_proc.poll() is not None:
                print("\n❌ Frontend parou inesperadamente.")
                break
                
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Encerrando servidores...")
        backend_proc.terminate()
        frontend_proc.terminate()
        print("Até logo!")

if __name__ == "__main__":
    if not os.path.exists("web/node_modules"):
        print("📦 Dependências do frontend não encontradas. Executando npm install...")
        subprocess.run(["npm", "install"], cwd="web", shell=True)
    
    run_app()
