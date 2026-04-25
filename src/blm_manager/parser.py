import re
from .models import BLMLine, BLMFile

class BLMParser:
    # Regex para capturar /k:v. 
    # Explicação: Procura por / seguido de uma letra, dois pontos e o valor até a próxima ocorrência de " /" ou fim da linha.
    PARAM_REGEX = re.compile(r"/([a-z]):(.*?)(?=\s/|$)")

    @staticmethod
    def parse_line(line_text: str) -> BLMLine:
        """Converte uma linha de texto em um objeto BLMLine"""
        line_text = line_text.strip()
        if not line_text:
            return None
        
        # O recurso termina onde começa o primeiro " /"
        first_param_idx = line_text.find(" /")
        
        if first_param_idx == -1:
            # Linha sem parâmetros (improvável no BLM, mas possível)
            return BLMLine(resource=line_text, raw_line=line_text)
        
        resource = line_text[:first_param_idx].strip()
        params_text = line_text[first_param_idx:]
        
        # Extrair parâmetros via Regex
        params = {}
        matches = BLMParser.PARAM_REGEX.findall(params_text)
        for key, value in matches:
            params[key] = value # Mantém como string para preservar espaços originais
            
        return BLMLine(resource=resource, params=params, raw_line=line_text)

    @staticmethod
    def serialize_line(line: BLMLine) -> str:
        """Converte um objeto BLMLine de volta para string"""
        # Mantemos a ordem padrão para garantir compatibilidade: m, t, i, s, f, r, d, o, n, x, g
        order = ['m', 't', 'i', 's', 'f', 'r', 'd', 'o', 'n', 'x', 'g']
        
        param_strings = []
        # Primeiro os conhecidos na ordem
        for k in order:
            if k in line.params:
                param_strings.append(f"/{k}:{line.params[k]}")
        
        # Depois qualquer outro que tenha aparecido (futura prova de falhas)
        for k, v in line.params.items():
            if k not in order:
                param_strings.append(f"/{k}:{v}")
                
        return f"{line.resource} {' '.join(param_strings)}"

    @classmethod
    def load(cls, file_path: str, encoding: str = 'latin-1') -> BLMFile:
        """Lê um arquivo do disco e retorna um BLMFile"""
        blm_file = BLMFile()
        with open(file_path, 'r', encoding=encoding) as f:
            lines = f.readlines()
            
            if not lines:
                return blm_file
                
            # A primeira linha é sempre o cabeçalho
            if lines[0].startswith('#'):
                blm_file.header = lines[0].strip()
                start_idx = 1
            else:
                start_idx = 0
                
            for text in lines[start_idx:]:
                parsed = cls.parse_line(text)
                if parsed:
                    blm_file.lines.append(parsed)
                    
        return blm_file

    @classmethod
    def save(cls, blm_file: BLMFile, file_path: str, encoding: str = 'latin-1'):
        """Salva um objeto BLMFile no disco"""
        with open(file_path, 'w', encoding=encoding) as f:
            if blm_file.header:
                f.write(blm_file.header + "\n")
            
            for line in blm_file.lines:
                f.write(cls.serialize_line(line) + "\n")
