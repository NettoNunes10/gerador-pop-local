import os
from .config import config
from .engine import PlaylistEngine

def run_first_scan():
    print("🚀 Iniciando Escaneamento Geral da Biblioteca...")
    engine = PlaylistEngine()
    
    # Mapear pastas de categorias baseadas nos modelos (ou apenas as padrões)
    # Por simplicidade, vamos escanear as pastas principais configuradas
    music_root = config.get_path('MUSIC_ROOT')
    
    if not os.path.exists(music_root):
        print(f"❌ Erro: Raiz de músicas não encontrada em {music_root}")
        return

    # Listar subpastas (categorias)
    categories = [d for d in os.listdir(music_root) if os.path.isdir(os.path.join(music_root, d))]
    
    print(f"📂 Categorias encontradas: {', '.join(categories)}")
    
    for cat in categories:
        folder_path = os.path.join(music_root, cat)
        print(f"\n--- Sincronizando: {cat} ---")
        engine.sync_folder_to_db(folder_path, cat)
        
    print("\n✨ Escaneamento concluído! O banco de dados está pronto.")

if __name__ == "__main__":
    run_first_scan()
