import sqlite3
import os

DB_PATH = "base_dados_radio.db"

def fix_bpms():
    if not os.path.exists(DB_PATH):
        print("Database not found.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Busca músicas que precisam de correção
    print("🔍 Analisando músicas para correção de oitava...")
    
    # Caso 1: BPM > 150 (quase certeza de ser dobrado em Sertanejo/Pop)
    cursor.execute("SELECT id, bpm, nome_musica, artista FROM biblioteca WHERE bpm > 150")
    to_fix_high = cursor.fetchall()
    
    # Caso 2: BPM > 128 com energia baixa/moderada (< 68%)
    cursor.execute("SELECT id, bpm, energy, nome_musica, artista FROM biblioteca WHERE bpm > 128 AND energy < 68 AND bpm <= 150")
    to_fix_energy = cursor.fetchall()
    
    total_fixed = 0
    
    print(f"🛠️ Corrigindo {len(to_fix_high)} músicas com BPM > 150...")
    for tid, bpm, title, artist in to_fix_high:
        new_bpm = round(bpm / 2, 2)
        cursor.execute("UPDATE biblioteca SET bpm = ? WHERE id = ?", (new_bpm, tid))
        total_fixed += 1
        # print(f"  ✅ {artist} - {title}: {bpm} -> {new_bpm}")

    print(f"🛠️ Corrigindo {len(to_fix_energy)} músicas com BPM > 128 e energia moderada...")
    for tid, bpm, energy, title, artist in to_fix_energy:
        new_bpm = round(bpm / 2, 2)
        cursor.execute("UPDATE biblioteca SET bpm = ? WHERE id = ?", (new_bpm, tid))
        total_fixed += 1
        # print(f"  ✅ {artist} - {title}: {bpm} ({energy}%) -> {new_bpm}")
        
    conn.commit()
    conn.close()
    print(f"\n✨ Sucesso! {total_fixed} músicas foram corrigidas no banco de dados.")

if __name__ == "__main__":
    fix_bpms()
