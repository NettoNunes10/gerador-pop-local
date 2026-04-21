import sys
import datetime
from src.core.engine import PlaylistEngine

if __name__ == '__main__':
    # Define padrão (Amanhã)
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y%m%d')

    print(f"\n--- Gerador POP Local (CLI) ---")
    user_input = input(f"Informe data inicial e dias ({tomorrow_str}, 1): ").strip()

    start_date = tomorrow
    days_to_generate = 1

    if user_input:
        parts = user_input.split(',')
        date_part = parts[0].strip()
        try:
            dt = datetime.datetime.strptime(date_part, '%Y%m%d')
            start_date = dt.date()
            if len(parts) > 1:
                days_to_generate = int(parts[1].strip())
        except ValueError:
            print("❌ Erro: Formato inválido. Use YYYYMMDD ou YYYYMMDD, N")
            sys.exit(1)

    print(f"\n🚀 Iniciando geração de {days_to_generate} dia(s) a partir de {start_date}...\n")

    engine = PlaylistEngine()
    for i in range(days_to_generate):
        current_date = start_date + datetime.timedelta(days=i)
        current_date_str = current_date.strftime('%Y%m%d')
        print(f"===================================================")
        print(f"▶️ Processando Dia {i + 1}/{days_to_generate}: {current_date_str}")
        print(f"===================================================")
        engine.generate_schedule(current_date_str)
