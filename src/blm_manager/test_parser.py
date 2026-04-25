import os
from src.blm_manager import BLMService

def test_blm_manager():
    # 1. Localizar arquivos
    base_dir = os.path.dirname(__file__)
    sample_path = os.path.join(base_dir, "sample.blm")
    output_path = os.path.join(base_dir, "sample_output.blm")

    print(f"--- TESTANDO BLM MANAGER ---")
    
    # 2. Carregar arquivo
    print(f"[*] Carregando: {sample_path}")
    blm = BLMService.load(sample_path)
    
    # 3. Verificar estatísticas
    stats = BLMService.get_stats(blm)
    print(f"[+] Estatísticas: {stats}")
    
    # 4. Modificar algo (Ex: Mudar o mix do Sertanejo)
    sertanejo_lines = blm.find_by_resource("SERTANEJO.apm")
    if sertanejo_lines:
        line = sertanejo_lines[0]
        old_mix = line.params.get('m')
        line.params['m'] = "9999"
        print(f"[!] Modificado: {line.resource} | Mix: {old_mix} -> {line.params['m']}")

    # 5. Salvar
    print(f"[*] Salvando em: {output_path}")
    BLMService.save(blm, output_path)
    
    # 6. Validar se o arquivo salvo existe e tem conteúdo
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='latin-1') as f:
            content = f.read()
            if "9999" in content:
                print(f"✅ SUCESSO: O arquivo foi salvo e a alteração persiste!")
            else:
                print(f"❌ ERRO: A alteração não foi encontrada no arquivo salvo.")
    else:
        print(f"❌ ERRO: O arquivo de saída não foi gerado.")

if __name__ == "__main__":
    test_blm_manager()
