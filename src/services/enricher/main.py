import os
import sys

# Garante que o diretório atual está no path para execuções diretas
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
try:
    from .analyzer import MusicAnalyzer
except ImportError:
    from analyzer import MusicAnalyzer

app = FastAPI(title="Essentia Music Enricher")
analyzer = MusicAnalyzer(models_path=os.path.join(os.path.dirname(__file__), "models"))

class EnrichRequest(BaseModel):
    path: str

@app.get("/status")
def status():
    return {"status": "online", "essentia": "loaded"}

@app.post("/enrich")
async def enrich_music(req: EnrichRequest):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail="Arquivo de áudio não encontrado no servidor.")
    
    try:
        # Realiza a análise pesada
        result = analyzer.analyze(req.path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import sys
    
    # Se rodar com "--api", inicia o servidor
    if "--api" in sys.argv:
        import uvicorn
        print("📡 Iniciando API de Enriquecimento na porta 8001...")
        uvicorn.run(app, host="0.0.0.0", port=8001)
    else:
        # Caso contrário, abre o seletor de arquivos (CLI Mode)
        import tkinter as tk
        from tkinter import filedialog
        import json

        # Esconde a janela principal do tkinter
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)

        while True:
            print("\n🎵 --- ESSENTIA STANDALONE ENRICHER ---")
            print("📂 Selecione um ou mais arquivos de áudio para analisar (ou cancele para sair)...")
            
            file_paths = filedialog.askopenfilenames(
                title="Selecionar Áudios para Análise",
                filetypes=[("Arquivos de Áudio", "*.mp3 *.wav *.flac *.m4a"), ("Todos os arquivos", "*.*")]
            )

            if not file_paths:
                print("🚫 Nenhum arquivo selecionado. Encerrando...")
                break

            for file_path in file_paths:
                print(f"\n🔍 [{file_paths.index(file_path)+1}/{len(file_paths)}] Analisando: {os.path.basename(file_path)}...")
                try:
                    result = analyzer.analyze(file_path)
                    
                    # Se houver erro no JSON, mostra o erro
                    if "error" in result:
                        print(f"❌ Erro: {result['error']}")
                        if "stderr" in result and result["stderr"]:
                            print(f"📝 Detalhes do erro:\n{result['stderr']}")
                        if "stdout" in result and result["stdout"]:
                            print(f"📋 Log de saída:\n{result['stdout']}")
                    else:
                        print("✨ Análise concluída com sucesso!")
                        
                        # Mostramos o JSON simplificado direto no console
                        print(json.dumps(result, indent=2, ensure_ascii=False))
                        
                        print(f"📊 BPM: {result.get('bpm')} | Energia: {result.get('energy')}% | Vibe: {result.get('vibe')}")
                    
                except Exception as e:
                    print(f"❌ Erro fatal na análise: {e}")
            
            print("\n✅ Lote finalizado.")
        
        root.destroy()
