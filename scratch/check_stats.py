
import sqlite3
import os

db_path = "base_dados_radio.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- Pesagem e Execução ---")
cursor.execute("""
    SELECT peso_especifico, COUNT(*) as total, 
           SUM(CASE WHEN data_ultima_execucao LIKE '20260423%' THEN 1 ELSE 0 END) as tocadas_amanha
    FROM biblioteca 
    GROUP BY peso_especifico 
    ORDER BY peso_especifico DESC
""")
rows = cursor.fetchall()
for row in rows:
    print(f"Peso {row['peso_especifico']}: {row['total']} músicas, {row['tocadas_amanha']} tocadas amanhã")

print("\n--- Detalhes Peso 3.1 ---")
cursor.execute("SELECT id, artista, nome_musica, data_ultima_execucao FROM biblioteca WHERE peso_especifico = 3.1")
for row in cursor.fetchall():
    print(dict(row))

conn.close()
