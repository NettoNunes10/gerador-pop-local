import subprocess
import sys
import os

def run_command(cmd, cwd=None):
    print(f"Executing: {cmd}")
    try:
        subprocess.check_call(cmd, shell=True, cwd=cwd)
    except subprocess.CalledProcessError as e:
        print(f"Error executing {cmd}: {e}")
        return False
    return True

def setup():
    print("🚀 Iniciando configuração do Gerador POP FM v3.1...")
    
    # 1. Backend Dependencies
    print("\n--- [1/3] Instalando dependências do Backend (Python) ---")
    if not run_command("pip install fastapi uvicorn mutagen pandas librosa"):
        print("❌ Falha ao instalar dependências do Python.")
        return

    # 2. Frontend Dependencies
    print("\n--- [2/3] Instalando dependências do Frontend (Node.js) ---")
    web_dir = os.path.join(os.getcwd(), "web")
    if not os.path.exists(web_dir):
        print("❌ Pasta 'web' não encontrada.")
        return
        
    if not run_command("npm install", cwd=web_dir):
        print("❌ Falha ao instalar dependências do Node.js.")
        return

    # 3. Finalizing
    print("\n--- [3/3] Finalizando ---")
    print("\n✅ Configuração concluída com sucesso!")
    print("\nPara iniciar o sistema, basta rodar:")
    print("   python run.py")

if __name__ == "__main__":
    setup()
