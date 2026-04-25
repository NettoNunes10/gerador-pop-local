import sqlite3
import os

DB_PATH = "base_dados_radio.db"

def check_bpms():
    if not os.path.exists(DB_PATH):
        print("Database not found.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("--- BPMs > 150 ---")
    cursor.execute("SELECT bpm, energy, nome_musica, artista FROM biblioteca WHERE bpm > 150 ORDER BY bpm DESC LIMIT 20")
    for row in cursor.fetchall():
        print(f"{row[0]} BPM | Energy: {row[1]}% | {row[3]} - {row[2]}")
    
    print("\n--- BPMs 130-150 with Low Energy ---")
    cursor.execute("SELECT bpm, energy, nome_musica, artista FROM biblioteca WHERE bpm > 130 AND energy < 60 LIMIT 20")
    for row in cursor.fetchall():
        print(f"{row[0]} BPM | Energy: {row[1]}% | {row[3]} - {row[2]}")
    
    conn.close()

if __name__ == "__main__":
    check_bpms()
