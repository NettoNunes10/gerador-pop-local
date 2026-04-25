
import sys
import os

# Adiciona o diretório src ao path para permitir importações
sys.path.append(os.path.join(os.getcwd(), 'src'))

from core.database import db
from core.config import config

def batch_update_weights(txt_file, new_weight, folder_filter=None):
    if not os.path.exists(txt_file):
        print(f"❌ Erro: Arquivo '{txt_file}' não encontrado.")
        return

    try:
        weight = float(new_weight)
    except ValueError:
        print(f"❌ Erro: '{new_weight}' não é um peso válido.")
        return

    # Determina automaticamente a categoria (TOP, HIT, STD, etc) baseada no peso
    new_group = config.get_group_for_weight(weight)

    with open(txt_file, 'r', encoding='utf-8') as f:
        filenames = [line.strip() for line in f if line.strip()]

    print(f"🚀 Iniciando atualização em lote:")
    print(f"   - Peso: {weight}")
    print(f"   - Grupo: {new_group}")
    if folder_filter:
        print(f"   - Filtro de Pasta: {folder_filter}")
    print(f"   - Total de músicas no TXT: {len(filenames)}\n")
    
    count = 0
    cursor = db.conn.cursor()

    for name in filenames:
        # Busca por nome do arquivo (final do caminho)
        query = "UPDATE biblioteca SET peso_especifico = ?, sub_categoria = ? WHERE caminho_arquivo LIKE ?"
        params = [weight, new_group, f"%{name}"]
        
        # Se o usuário especificou uma pasta, filtramos por ela também
        if folder_filter:
            query += " AND pasta_categoria = ?"
            params.append(folder_filter)
            
        cursor.execute(query, params)
        
        if cursor.rowcount > 0:
            count += cursor.rowcount
            print(f"✅ [{new_group}] {name}")
        else:
            print(f"⚠️  Não encontrado: {name}")

    db.conn.commit()
    print(f"\n✨ Concluído! {count} músicas atualizadas para {new_group} (Peso {weight}).")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python batch_weight.py <arquivo.txt> <novo_peso> [nome_da_pasta]")
        print("Exemplo: python batch_weight.py SERTANEJO_C.txt 3.0 'SERTANEJO C'")
    else:
        folder = sys.argv[3] if len(sys.argv) > 3 else None
        batch_update_weights(sys.argv[1], sys.argv[2], folder)
