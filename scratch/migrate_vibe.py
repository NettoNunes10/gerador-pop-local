import sqlite3
import os

DB_PATH = "base_dados_radio.db"

def migrate_vibe():
    if not os.path.exists(DB_PATH):
        print("Database not found.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("🔍 Analisando músicas para correção de Vibe (Nova Escala 0-100)...")
    
    # Busca itens que precisam de correção (vibe < 5 ou NULL, e que tenham energia/valence)
    cursor.execute("""
        UPDATE biblioteca 
        SET vibe = CAST((energy + valence) / 2 AS INTEGER)
        WHERE (vibe < 5 OR vibe IS NULL) AND energy > 0 AND valence > 0
    """)
    
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    
    print(f"✨ Sucesso! {rows_affected} músicas foram atualizadas para a nova escala de Vibe baseada em (Energy + Valence) / 2.")

if __name__ == "__main__":
    migrate_vibe()
